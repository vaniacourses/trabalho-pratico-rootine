import { BATCH_DURATION_HOURS } from "@/constants/flashcards";
import { supabase } from "@/lib/supabase";
import { invokeFunction } from "@/lib/rootineApi";
import { create } from "zustand";

const ANSWER_RETRY_DELAYS_MS = [250, 700];

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableNetworkError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  const name = String((error as any)?.name ?? "").toLowerCase();

  return (
    name.includes("fetch") ||
    message.includes("failed to fetch") ||
    message.includes("failed to send") ||
    message.includes("network") ||
    message.includes("err_network_changed")
  );
}

async function invokeAnswerCardWithRetry(
  userId: string,
  answerId: string,
  answer: boolean | null,
) {
  let lastResult: Awaited<ReturnType<typeof invokeFunction>> | null = null;

  for (let attempt = 0; attempt <= ANSWER_RETRY_DELAYS_MS.length; attempt += 1) {
    const result = await invokeFunction("answer-adventure-card", {
      body: {
        userId,
        answerId,
        answer,
      },
    });

    lastResult = result;

    if (!result.error || !isRetryableNetworkError(result.error)) {
      return result;
    }

    const delay = ANSWER_RETRY_DELAYS_MS[attempt];
    if (delay) await sleep(delay);
  }

  return lastResult ?? { data: null, error: new Error("Falha ao responder carta.") };
}

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
  category: string | null;
  signalType: string | null;
  difficulty: number | null;
  answer: boolean | null;
  answeredAt: string | null;
}

interface BatchFlashcardPayload {
  id: string;
  flashcard_id: string;
  answer: boolean | null;
  answered_at?: string | null;
  flashcards?: {
    question?: string | null;
    category?: string | null;
    signal_type?: string | null;
    difficulty?: number | null;
  } | null;
}

interface FlashcardState {
  currentBatch: DailyBatch | null;
  pendingFlashcards: FlashcardAnswer[];
  answeredCount: number;
  loading: boolean;
  nextBatchAt: string | null;

  // Ações
  fetchActiveBatch: (userId: string) => Promise<void>;
  answerFlashcard: (userId: string, answerId: string, answer: boolean | null) => Promise<boolean>;
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
        .select("id, flashcard_id, answer, answered_at")
        .eq("daily_batch", batch.id);

      if (ansErr) {
        console.error("Erro ao buscar respostas:", ansErr);
        set({ loading: false });
        return;
      }

      // 4. Busca as perguntas dos flashcards em separado (evita join com RLS)
      const flashcardIds = (answers || []).map((a: any) => a.flashcard_id);
      let questionsMap: Record<
        string,
        {
          question?: string;
          category?: string | null;
          signal_type?: string | null;
          difficulty?: number | null;
        }
      > = {};

      if (flashcardIds.length > 0) {
        const { data: flashcards } = await supabase
          .from("flashcards")
          .select("id, question, category, signal_type, difficulty")
          .in("id", flashcardIds);

        questionsMap = Object.fromEntries(
          (flashcards || []).map((f: any) => [f.id, f]),
        );
      }

      // 5. Mapear para FlashcardAnswer e separar pendentes
      const allCards: FlashcardAnswer[] = (answers || []).map((a: any) => ({
        answerId: a.id,
        flashcardId: a.flashcard_id,
        question: questionsMap[a.flashcard_id]?.question || "Pergunta não encontrada",
        category: questionsMap[a.flashcard_id]?.category ?? null,
        signalType: questionsMap[a.flashcard_id]?.signal_type ?? null,
        difficulty: questionsMap[a.flashcard_id]?.difficulty ?? null,
        answer: a.answer,
        answeredAt: a.answered_at ?? null,
      }));

      const pending = allCards.filter((c) => c.answeredAt === null);
      const answered = allCards.filter((c) => c.answeredAt !== null).length;

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

  answerFlashcard: async (userId: string, answerId: string, answer: boolean | null) => {
    const { data, error } = await invokeAnswerCardWithRetry(userId, answerId, answer);

    if (!error && !data?.error) {
      // Remove da lista de pendentes localmente para resposta instantânea
      set((state) => ({
        pendingFlashcards: state.pendingFlashcards.filter(
          (f) => f.answerId !== answerId,
        ),
        answeredCount: state.answeredCount + 1,
      }));
      return true;
    } else {
      console.error("Erro ao responder carta da Aventura:", error ?? data?.error);
      return false;
    }
  },

  checkBatchExpiry: async (batch: DailyBatch): Promise<boolean> => {
    const createdAt = new Date(batch.created_at).getTime();
    const expiresAt = createdAt + BATCH_DURATION_HOURS * 60 * 60 * 1000;
    const now = Date.now();

    if (now >= expiresAt) {
      const { data, error } = await invokeFunction("complete-adventure-batch", {
        body: {
          userId: batch.user_id,
          batchId: batch.id,
          expired: true,
        },
      });

      if (!error && !data?.error) {
        invokeFunction("sync-user-brain", {
            body: {
              userId: batch.user_id,
              event_type: "BATCH_COMPLETED",
              batchId: batch.id,
            },
          })
          .catch((err) => console.error("[BRAIN] Sync lote expirado error:", err));
      }

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
      const { data, error } = await invokeFunction(
        "complete-adventure-batch",
        {
          body: { userId, batchId },
        },
      );

      if (error || data?.error) {
        throw error ?? new Error(String(data?.error));
      }

      invokeFunction("sync-user-brain", {
          body: {
            userId,
            event_type: "BATCH_COMPLETED",
            batchId,
          },
        })
        .catch((err) => console.error("[BRAIN] Sync lote concluído error:", err));

      set({ currentBatch: null, pendingFlashcards: [], answeredCount: 0 });
    } catch (err) {
      console.error("Erro ao completar batch:", err);
      throw err;
    }
  },

  requestNewBatch: async (userId: string) => {
    set({ loading: true });
    try {
      await supabase
        .from("profiles")
        .update({ daily_flashcards_completed: false })
        .eq("id", userId);

      const { data, error } = await invokeFunction(
        "generate-batch",
        {
          body: { userId },
        },
      );

      if (error) throw error;

      console.log("[ADVENTURE] Novo batch gerado:", {
        success: data?.success,
        reused: data?.reused,
        amount: data?.flashcards?.length,
      });

      if (data?.batch && Array.isArray(data?.flashcards)) {
        const allCards: FlashcardAnswer[] = data.flashcards.map(
          (card: BatchFlashcardPayload) => ({
            answerId: card.id,
            flashcardId: card.flashcard_id,
            question: card.flashcards?.question || "Pergunta não encontrada",
            category: card.flashcards?.category ?? null,
            signalType: card.flashcards?.signal_type ?? null,
            difficulty: card.flashcards?.difficulty ?? null,
            answer: card.answer,
            answeredAt: card.answered_at ?? null,
          }),
        );
        const pending = allCards.filter((card) => card.answeredAt === null);

        set({
          currentBatch: data.batch,
          pendingFlashcards: pending,
          answeredCount: allCards.length - pending.length,
        });
      } else {
        // Recarrega o batch ativo quando a função não devolve o payload completo.
        await get().fetchActiveBatch(userId);
      }
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
