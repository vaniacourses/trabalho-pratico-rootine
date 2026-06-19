import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_SCHEMA_VERSION,
  buildFlashcardFact,
  FLASHCARD_ANSWER_XP,
  getFlashcardEffect,
} from "../_shared/adventure.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";
import { unlockEligibleAchievements } from "../_shared/progress.ts";

interface AnswerAdventureCardPayload {
  userId: string;
  answerId: string;
  answer: boolean | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as AnswerAdventureCardPayload;
    const { userId, answerId } = body;
    const answer = body.answer;

    if (!userId || !answerId) {
      throw new Error("Parâmetros obrigatórios: userId, answerId.");
    }

    if (![true, false, null].includes(answer)) {
      throw new Error("Resposta inválida para carta da Aventura.");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();

    const { data: answerRow, error: answerError } = await supabaseAdmin
      .from("user_flashcards_answers")
      .select("id, user_id, flashcard_id, daily_batch, answer, answered_at")
      .eq("id", answerId)
      .eq("user_id", userId)
      .maybeSingle();

    if (answerError) throw new Error(`Erro ao buscar resposta: ${answerError.message}`);
    if (!answerRow) throw new Error("Resposta da carta não encontrada.");

    if (answerRow.answer !== null || answerRow.answered_at) {
      return jsonResponse({
        success: true,
        reused: true,
        xp: { xpGranted: 0, capped: false, alreadyAwarded: true },
      });
    }

    const { data: flashcard, error: flashcardError } = await supabaseAdmin
      .from("flashcards")
      .select("id, question, category, signal_key, signal_type, true_effect, false_effect, skip_effect, difficulty, weight")
      .eq("id", answerRow.flashcard_id)
      .maybeSingle();

    if (flashcardError) {
      throw new Error(`Erro ao buscar carta: ${flashcardError.message}`);
    }
    if (!flashcard) throw new Error("Carta não encontrada.");

    const answeredAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("user_flashcards_answers")
      .update({ answer, answered_at: answeredAt })
      .eq("id", answerId)
      .eq("user_id", userId);

    if (updateError) {
      throw new Error(`Erro ao registrar resposta da carta: ${updateError.message}`);
    }

    const eventId = crypto.randomUUID();
    const effect = getFlashcardEffect(flashcard as any, answer);
    const { error: eventError } = await supabaseAdmin
      .from("user_profile_events")
      .insert({
        id: eventId,
        user_id: userId,
        event_type: "FLASHCARD_ANSWERED",
        source: "adventure",
        source_table: "user_flashcards_answers",
        source_id: answerId,
        payload: {
          answer,
          flashcard_id: flashcard.id,
          daily_batch: answerRow.daily_batch,
          category: flashcard.category,
          signal_key: flashcard.signal_key,
          signal_type: flashcard.signal_type,
          difficulty: flashcard.difficulty,
          effect,
        },
        metadata: {
          schema_version: ADVENTURE_SCHEMA_VERSION,
          algorithm: ADVENTURE_ALGORITHM_VERSION,
          skip_creates_fact: answer === null ? false : null,
        },
        schema_version: ADVENTURE_SCHEMA_VERSION,
        occurred_at: answeredAt,
      });

    if (eventError) {
      throw new Error(`Erro ao gravar evento da carta: ${eventError.message}`);
    }

    const derivedFact = buildFlashcardFact(flashcard as any, answer, eventId);
    let factWritten = false;

    if (derivedFact) {
      const { error: factError } = await supabaseAdmin
        .from("user_profile_facts")
        .upsert(
          {
            ...derivedFact,
            user_id: userId,
            last_seen_at: answeredAt,
            updated_at: answeredAt,
          },
          { onConflict: "user_id,fact_key" },
        );

      if (factError) {
        throw new Error(`Erro ao gravar fato da carta: ${factError.message}`);
      }
      factWritten = true;
    }

    const xp = {
      xpGranted: answer === null ? 0 : FLASHCARD_ANSWER_XP,
      capped: false,
      alreadyAwarded: false,
      ledgerId: null,
    };
    const achievements = await unlockEligibleAchievements(supabaseAdmin, userId, "answer-adventure-card");

    return jsonResponse({
      success: true,
      answer_id: answerId,
      fact_written: factWritten,
      xp,
      achievements,
    });
  } catch (error: any) {
    console.error("[ADVENTURE] Erro ao responder carta:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
