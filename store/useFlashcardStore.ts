import { BATCH_DURATION_HOURS } from "@/constants/flashcards";
import { supabase } from "@/lib/supabase";
import { create } from "zustand";

// Tipagens baseadas no schema do Supabase
interface DailyBatch {
  id: string;
  user_id: string;
  created_at: string;
  completed_at: string | null;
  active: boolean;
  amount: number;
}

interface FlashcardAnswer {
  answerId: string;
  flashcardId: string;
  question: string;
  answer: boolean | null;
}

interface FlashcardState {
  currentBatch: DailyBatch | null;
  pendingFlashcards: FlashcardAnswer[];
  answeredCount: number;
  loading: boolean;
  nextBatchAt: string | null;

  // Ações
  fetchActiveBatch: (userId: string) => Promise<void>;
  answerFlashcard: (answerId: string, answer: boolean | null) => Promise<void>;
  checkBatchExpiry: (batch: DailyBatch) => Promise<boolean>;
  completeBatch: (userId: string, batchId: string) => Promise<void>;
  requestNewBatch: (userId: string) => Promise<void>;
  reset: () => void;
}

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  currentBatch: null,
  pendingFlashcards: [],
  answeredCount: 0,
  loading: false,
  nextBatchAt: null,

  fetchActiveBatch: async (userId: string) => {
    set({ loading: true });
    try {
      // 1. Busca batch ativo do usuário
      const { data: batch, error: batchErr } = await supabase
        .from("user_daily_flashcards")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();

      if (batchErr) {
        console.error("Erro ao buscar batch:", batchErr);
        set({ loading: false });
        return;
      }

      if (!batch) {
        set({ currentBatch: null, pendingFlashcards: [], loading: false });
        return;
      }

      // 2. Verifica expiração antes de carregar respostas
      const expired = await get().checkBatchExpiry(batch);
      if (expired) {
        set({ loading: false });
        return;
      }

      // 3. Busca as respostas do batch
      const { data: answers, error: ansErr } = await supabase
        .from("user_flashcards_answers")
        .select("id, flashcard_id, answer")
        .eq("daily_batch", batch.id);

      if (ansErr) {
        console.error("Erro ao buscar respostas:", ansErr);
        set({ loading: false });
        return;
      }

      // 4. Busca as perguntas dos flashcards em separado (evita join com RLS)
      const flashcardIds = (answers || []).map((a: any) => a.flashcard_id);
      let questionsMap: Record<string, string> = {};

      if (flashcardIds.length > 0) {
        const { data: flashcards } = await supabase
          .from("flashcards")
          .select("id, question")
          .in("id", flashcardIds);

        questionsMap = Object.fromEntries(
          (flashcards || []).map((f: any) => [f.id, f.question]),
        );
      }

      // 5. Mapear para FlashcardAnswer e separar pendentes
      const allCards: FlashcardAnswer[] = (answers || []).map((a: any) => ({
        answerId: a.id,
        flashcardId: a.flashcard_id,
        question: questionsMap[a.flashcard_id] || "Pergunta não encontrada",
        answer: a.answer,
      }));

      const pending = allCards.filter((c) => c.answer === null);
      const answered = allCards.filter((c) => c.answer !== null).length;

      set({
        currentBatch: batch,
        pendingFlashcards: pending,
        answeredCount: answered,
      });
    } catch (err) {
      console.error("Erro inesperado fetchActiveBatch:", err);
    } finally {
      set({ loading: false });
    }
  },

  answerFlashcard: async (answerId: string, answer: boolean | null) => {
    const { error } = await supabase
      .from("user_flashcards_answers")
      .update({ answer })
      .eq("id", answerId);

    if (!error) {
      // Remove da lista de pendentes localmente para resposta instantânea
      set((state) => ({
        pendingFlashcards: state.pendingFlashcards.filter(
          (f) => f.answerId !== answerId,
        ),
        answeredCount: state.answeredCount + 1,
      }));
    } else {
      console.error("Erro ao responder flashcard:", error);
    }
  },

  checkBatchExpiry: async (batch: DailyBatch): Promise<boolean> => {
    const createdAt = new Date(batch.created_at).getTime();
    const expiresAt = createdAt + BATCH_DURATION_HOURS * 60 * 60 * 1000;
    const now = Date.now();

    if (now >= expiresAt) {
      // Batch expirou: fechar e contar respostas
      const { data: answers } = await supabase
        .from("user_flashcards_answers")
        .select("id, answer")
        .eq("daily_batch", batch.id);

      const answeredCount = (answers || []).filter(
        (a: any) => a.answer !== null,
      ).length;

      await supabase
        .from("user_daily_flashcards")
        .update({
          active: false,
          completed_at: new Date().toISOString(),
          amount: answeredCount,
        })
        .eq("id", batch.id);

      // Dispara sync-user-brain mesmo com lote parcial — não-bloqueante
      supabase.functions
        .invoke("sync-user-brain", {
          body: { userId: batch.user_id, event_type: "BATCH_COMPLETED", batchId: batch.id },
        })
        .catch((err) => console.error("[FLASHCARD] Brain sync (timeout) error:", err));

      set({
        currentBatch: null,
        pendingFlashcards: [],
        answeredCount: 0,
        nextBatchAt: null,
      });

      return true;
    }

    // Armazena o horário de expiração para o cronômetro
    set({ nextBatchAt: new Date(expiresAt).toISOString() });
    return false;
  },

  completeBatch: async (userId: string, batchId: string) => {
    try {
      // 1. Marca o batch como concluído
      await supabase
        .from("user_daily_flashcards")
        .update({ active: false, completed_at: new Date().toISOString() })
        .eq("id", batchId);

      // 2. Seta daily_flashcards_completed = true no perfil
      await supabase
        .from("profiles")
        .update({ daily_flashcards_completed: true })
        .eq("id", userId);

      // 3. Dispara sync-user-brain (BATCH_COMPLETED) — não-bloqueante
      supabase.functions
        .invoke("sync-user-brain", {
          body: { userId, event_type: "BATCH_COMPLETED", batchId },
        })
        .then(() => console.log("[FLASHCARD] Brain sync disparado (BATCH_COMPLETED)"))
        .catch((err) => console.error("[FLASHCARD] Brain sync error:", err));

      set({ currentBatch: null, pendingFlashcards: [], answeredCount: 0 });
    } catch (err) {
      console.error("Erro ao completar batch:", err);
    }
  },

  requestNewBatch: async (userId: string) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-batch",
        {
          body: { userId },
        },
      );

      if (error) throw error;

      console.log("[FLASHCARD] Novo batch gerado:", data);

      // Recarrega o batch ativo para popular o estado
      await get().fetchActiveBatch(userId);
    } catch (err) {
      console.error("Erro ao solicitar novo batch:", err);
    } finally {
      set({ loading: false });
    }
  },

  reset: () =>
    set({
      currentBatch: null,
      pendingFlashcards: [],
      answeredCount: 0,
      loading: false,
      nextBatchAt: null,
    }),
}));
