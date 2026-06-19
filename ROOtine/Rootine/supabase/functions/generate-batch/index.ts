import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_SCHEMA_VERSION,
  FLASHCARD_BATCH_SIZE,
  FLASHCARD_COMPLETION_XP,
  FLASHCARD_RECENT_DAYS,
  isoDaysAgo,
  selectBalancedFlashcards,
} from "../_shared/adventure.ts";
import { awardXpLedger, unlockEligibleAchievements } from "../_shared/progress.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

async function finalizeStaleCompletedBatch(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  batch: { id: string; completed_at?: string | null },
  answers: Array<{ id: string; answer: boolean | null; answered_at: string | null }>,
) {
  const completedAt = batch.completed_at ?? new Date().toISOString();
  const answeredRows = answers.filter((row) => row.answered_at !== null);
  const answeredCount = answeredRows.filter((row) => row.answer !== null).length;
  const skippedCount = answeredRows.filter((row) => row.answer === null).length;
  const minimumAnsweredForXp = Math.ceil(answers.length * 0.7);

  const { error: batchError } = await supabaseAdmin
    .from("user_daily_flashcards")
    .update({
      active: false,
      completed_at: completedAt,
      amount: answeredCount,
    })
    .eq("id", batch.id)
    .eq("user_id", userId);

  if (batchError) {
    throw new Error(`Erro ao encerrar lote completo anterior: ${batchError.message}`);
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ daily_flashcards_completed: true })
    .eq("id", userId);

  if (profileError) {
    throw new Error(`Erro ao atualizar conclusão da Aventura: ${profileError.message}`);
  }

  const { data: existingEvent, error: existingEventError } = await supabaseAdmin
    .from("user_profile_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", "BATCH_COMPLETED")
    .eq("source_table", "user_daily_flashcards")
    .eq("source_id", batch.id)
    .maybeSingle();

  if (existingEventError) {
    throw new Error(`Erro ao checar evento de lote anterior: ${existingEventError.message}`);
  }

  if (!existingEvent) {
    const { error: eventError } = await supabaseAdmin
      .from("user_profile_events")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        event_type: "BATCH_COMPLETED",
        source: "adventure",
        source_table: "user_daily_flashcards",
        source_id: batch.id,
        payload: {
          batch_id: batch.id,
          answered_count: answeredCount,
          skipped_count: skippedCount,
          pending_count: 0,
          total_count: answers.length,
          min_answered_for_xp: minimumAnsweredForXp,
          expired: false,
          repaired_by: "generate-batch",
        },
        metadata: {
          schema_version: ADVENTURE_SCHEMA_VERSION,
          algorithm: ADVENTURE_ALGORITHM_VERSION,
          repaired_stale_active_batch: true,
        },
        schema_version: ADVENTURE_SCHEMA_VERSION,
        occurred_at: completedAt,
      });

    if (eventError) {
      throw new Error(`Erro ao gravar evento de lote anterior: ${eventError.message}`);
    }
  }

  await awardXpLedger(supabaseAdmin, {
    userId,
    sourceType: "adventure_batch",
    sourceId: batch.id,
    reason: "Lote da Aventura concluído",
    requestedXp: answers.length > 0 && answeredCount >= minimumAnsweredForXp ? FLASHCARD_COMPLETION_XP : 0,
    idempotencyKey: `adventure_batch:${batch.id}`,
    metadata: {
      answered_count: answeredCount,
      skipped_count: skippedCount,
      pending_count: 0,
      total_count: answers.length,
      min_answered_for_xp: minimumAnsweredForXp,
      repaired_by: "generate-batch",
    },
  });
  await unlockEligibleAchievements(supabaseAdmin, userId, "generate-batch-repair");
}

serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validação do userId
    const { userId } = await req.json();
    if (!userId) {
      throw new Error(
        "O parâmetro 'userId' é obrigatório no corpo da requisição.",
      );
    }

    await requireUserIdFromJwt(req, userId);

    // 2. Cliente Admin (usa Service Role Key para bypass de RLS)
    const supabaseAdmin = createSupabaseAdmin();

    console.log("[ADVENTURE] Gerando lote.", { userId });

    // 3. Verifica se já existe um batch ativo (idempotente)
    const { data: existingBatch, error: checkErr } = await supabaseAdmin
      .from("user_daily_flashcards")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();

    if (checkErr) throw new Error(`Erro ao checar batch: ${checkErr.message}`);

    if (existingBatch) {
      // Já existe um batch ativo — retorna ele com os flashcards associados
      const { data: existingAnswers, error: existingAnswersError } = await supabaseAdmin
        .from("user_flashcards_answers")
        .select("id, flashcard_id, answer, answered_at, flashcards(question, category, signal_key, signal_type, difficulty)")
        .eq("daily_batch", existingBatch.id)
        .eq("user_id", userId);

      if (existingAnswersError) {
        throw new Error(`Erro ao buscar respostas do batch ativo: ${existingAnswersError.message}`);
      }

      const answerRows = existingAnswers ?? [];
      const pendingRows = answerRows.filter((answer: any) => answer.answered_at === null);

      if (answerRows.length > 0 && pendingRows.length > 0) {
        console.log("[ADVENTURE] Batch ativo encontrado, retornando existente.", {
          userId,
          batchId: existingBatch.id,
          pendingCount: pendingRows.length,
        });
        return jsonResponse({
          success: true,
          batch: existingBatch,
          flashcards: answerRows,
          reused: true,
        });
      }

      console.log("[ADVENTURE] Batch ativo sem pendentes encontrado; encerrando antes de criar outro.", {
        userId,
        batchId: existingBatch.id,
        answerCount: answerRows.length,
      });
      await finalizeStaleCompletedBatch(supabaseAdmin, userId, existingBatch, answerRows);
    }

    // 4. Selecionar flashcards balanceados usando metadados e histórico.
    const { data: allFlashcards, error: flashErr } = await supabaseAdmin
      .from("flashcards")
      .select("id, question, category, signal_key, signal_type, true_effect, false_effect, skip_effect, difficulty, weight")
      .eq("active", true)
      .not("category", "is", null)
      .not("signal_key", "is", null)
      .not("signal_type", "is", null);

    if (flashErr)
      throw new Error(`Erro ao buscar flashcards: ${flashErr.message}`);

    if (!allFlashcards || allFlashcards.length === 0) {
      throw new Error(
        "Nenhum flashcard disponível no banco. Insira perguntas na tabela 'flashcards'.",
      );
    }

    const { data: recentAnswers, error: recentErr } = await supabaseAdmin
      .from("user_flashcards_answers")
      .select("flashcard_id")
      .eq("user_id", userId)
      .not("answer", "is", null)
      .gte("answered_at", isoDaysAgo(FLASHCARD_RECENT_DAYS));

    if (recentErr) {
      throw new Error(`Erro ao buscar histórico recente: ${recentErr.message}`);
    }

    const recentFlashcardIds = new Set(
      (recentAnswers ?? [])
        .map((answer: any) => answer.flashcard_id)
        .filter((id: unknown): id is string => typeof id === "string"),
    );
    const flashcards = selectBalancedFlashcards(
      allFlashcards as any,
      recentFlashcardIds,
      userId,
    );

    if (flashcards.length < FLASHCARD_BATCH_SIZE) {
      throw new Error(
        `Catálogo insuficiente para lote da Aventura. Necessário: ${FLASHCARD_BATCH_SIZE}; disponível: ${flashcards.length}.`,
      );
    }

    console.log("[ADVENTURE] Flashcards selecionados.", {
      userId,
      count: flashcards.length,
      categories: flashcards.map((card: any) => card.category),
      recentAvoided: recentFlashcardIds.size,
    });

    // 5. Criar o batch
    const batchId = crypto.randomUUID();
    const { data: newBatch, error: batchErr } = await supabaseAdmin
      .from("user_daily_flashcards")
      .insert({
        id: batchId,
        user_id: userId,
        active: true,
        amount: flashcards.length,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (batchErr)
      throw new Error(`Erro ao criar batch: ${batchErr.message}`);

    const { error: profileBatchError } = await supabaseAdmin
      .from("profiles")
      .update({ daily_flashcards_completed: false })
      .eq("id", userId);

    if (profileBatchError) {
      throw new Error(`Erro ao marcar Aventura em andamento: ${profileBatchError.message}`);
    }

    // 6. Criar as linhas de resposta (answer = NULL = pendente)
    const answerRows = flashcards.map((fc: any) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      flashcard_id: fc.id,
      daily_batch: batchId,
      answer: null,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from("user_flashcards_answers")
      .insert(answerRows);

    if (insertErr)
      throw new Error(`Erro ao criar respostas: ${insertErr.message}`);

    console.log("[ADVENTURE] Batch criado.", { userId, batchId, count: answerRows.length });

    // 7. Retorna o batch completo
    const responseFlashcards = flashcards.map((fc: any, i: number) => ({
      id: answerRows[i].id,
      flashcard_id: fc.id,
      answer: null,
      answered_at: null,
      flashcards: {
        question: fc.question,
        category: fc.category,
        signal_key: fc.signal_key,
        signal_type: fc.signal_type,
        difficulty: fc.difficulty,
      },
    }));

    return jsonResponse({
      success: true,
      batch: newBatch,
      flashcards: responseFlashcards,
      reused: false,
    });
  } catch (error: any) {
    console.error("[ADVENTURE] Erro crítico ao gerar lote:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
