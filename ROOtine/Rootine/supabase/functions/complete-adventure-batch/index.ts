import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_SCHEMA_VERSION,
  FLASHCARD_COMPLETION_XP,
} from "../_shared/adventure.ts";
import {
  awardXpLedger,
  unlockEligibleAchievements,
} from "../_shared/progress.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

interface CompleteAdventureBatchPayload {
  userId: string;
  batchId: string;
  expired?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as CompleteAdventureBatchPayload;
    const { userId, batchId } = body;
    const expired = Boolean(body.expired);

    if (!userId || !batchId) {
      throw new Error("Parâmetros obrigatórios: userId, batchId.");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("user_daily_flashcards")
      .select("id, user_id, active, completed_at")
      .eq("id", batchId)
      .eq("user_id", userId)
      .maybeSingle();

    if (batchError) throw new Error(`Erro ao buscar lote: ${batchError.message}`);
    if (!batch) throw new Error("Lote da Aventura não encontrado.");

    const { data: answers, error: answersError } = await supabaseAdmin
      .from("user_flashcards_answers")
      .select("id, answer, flashcard_id, answered_at")
      .eq("daily_batch", batchId)
      .eq("user_id", userId);

    if (answersError) {
      throw new Error(`Erro ao contar respostas do lote: ${answersError.message}`);
    }

    const answeredRows = (answers ?? []).filter((row: any) => row.answered_at !== null);
    const answeredCount = answeredRows.filter((row: any) => row.answer !== null).length;
    const skippedCount = answeredRows.filter((row: any) => row.answer === null).length;
    const pendingCount = (answers ?? []).filter((row: any) => row.answered_at === null).length;
    const totalCount = answers?.length ?? 0;
    const minimumAnsweredForXp = Math.ceil(totalCount * 0.7);
    const completedAt = batch.completed_at ?? new Date().toISOString();

    if (batch.active || !batch.completed_at) {
      const { error: updateBatchError } = await supabaseAdmin
        .from("user_daily_flashcards")
        .update({
          active: false,
          completed_at: completedAt,
          amount: answeredCount,
        })
        .eq("id", batchId)
        .eq("user_id", userId);

      if (updateBatchError) {
        throw new Error(`Erro ao concluir lote: ${updateBatchError.message}`);
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ daily_flashcards_completed: true })
      .eq("id", userId);

    if (profileError) {
      throw new Error(`Erro ao marcar Aventura diária: ${profileError.message}`);
    }

    const eventId = crypto.randomUUID();
    const { error: eventError } = await supabaseAdmin
      .from("user_profile_events")
      .insert({
        id: eventId,
        user_id: userId,
        event_type: "BATCH_COMPLETED",
        source: "adventure",
        source_table: "user_daily_flashcards",
        source_id: batchId,
        payload: {
          batch_id: batchId,
          answered_count: answeredCount,
          skipped_count: skippedCount,
          pending_count: pendingCount,
          total_count: totalCount,
          min_answered_for_xp: minimumAnsweredForXp,
          expired,
        },
        metadata: {
          schema_version: ADVENTURE_SCHEMA_VERSION,
          algorithm: ADVENTURE_ALGORITHM_VERSION,
        },
        schema_version: ADVENTURE_SCHEMA_VERSION,
        occurred_at: completedAt,
      });

    if (eventError && eventError.code !== "23505") {
      throw new Error(`Erro ao gravar evento do lote: ${eventError.message}`);
    }

    const xp = await awardXpLedger(supabaseAdmin, {
      userId,
      sourceType: "adventure_batch",
      sourceId: batchId,
      reason: expired
        ? "Lote da Aventura encerrado por tempo"
        : "Lote da Aventura concluído",
      requestedXp: !expired && totalCount > 0 && answeredCount >= minimumAnsweredForXp
        ? FLASHCARD_COMPLETION_XP
        : 0,
      idempotencyKey: `adventure_batch:${batchId}`,
      metadata: {
        answered_count: answeredCount,
        skipped_count: skippedCount,
        pending_count: pendingCount,
        total_count: totalCount,
        min_answered_for_xp: minimumAnsweredForXp,
        expired,
      },
    });
    const achievements = await unlockEligibleAchievements(supabaseAdmin, userId, "complete-adventure-batch");

    return jsonResponse({
      success: true,
      answered_count: answeredCount,
      skipped_count: skippedCount,
      pending_count: pendingCount,
      xp,
      achievements,
    });
  } catch (error: any) {
    console.error("[ADVENTURE] Erro ao concluir lote:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
