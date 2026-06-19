import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_SCHEMA_VERSION,
  awardXpWithDailyCap,
  buildQuizFact,
  QUIZ_CORRECT_XP,
  QUIZ_DAILY_XP_CAP,
  QUIZ_REVIEW_XP,
} from "../_shared/adventure.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";
import { unlockEligibleAchievements } from "../_shared/progress.ts";

interface AnswerAdventureQuizPayload {
  userId: string;
  quizId: string;
  quizQuestionId: string;
  selectedOption: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as AnswerAdventureQuizPayload;
    const { userId, quizId, quizQuestionId, selectedOption } = body;

    if (!userId || !quizId || !quizQuestionId || !selectedOption) {
      throw new Error("Parâmetros obrigatórios: userId, quizId, quizQuestionId, selectedOption.");
    }

    if (!["A", "B", "C", "D"].includes(selectedOption)) {
      throw new Error("Alternativa selecionada inválida.");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();

    const [{ data: quiz, error: quizError }, { data: quizQuestion, error: questionError }] =
      await Promise.all([
        supabaseAdmin
          .from("quizzes")
          .select("id, user_id, question, options, correct_option, explanation, category")
          .eq("id", quizId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("quiz_questions")
          .select("id, category, question, options, correct_option, explanation, difficulty, signal_key, metadata")
          .eq("id", quizQuestionId)
          .eq("active", true)
          .maybeSingle(),
      ]);

    if (quizError) throw new Error(`Erro ao buscar quiz: ${quizError.message}`);
    if (questionError) throw new Error(`Erro ao buscar quiz_question: ${questionError.message}`);
    if (!quiz) throw new Error("Quiz não encontrado.");
    if (!quizQuestion) throw new Error("quiz_question não encontrada.");

    const { data: existingAnswer } = await supabaseAdmin
      .from("user_quiz_answers")
      .select("id, correct")
      .eq("user_id", userId)
      .eq("quiz_id", quizId)
      .maybeSingle();

    if (existingAnswer) {
      return jsonResponse({
        success: true,
        reused: true,
        correct: Boolean(existingAnswer.correct),
        explanation: quizQuestion.explanation,
        xp: { xpGranted: 0, capped: false, alreadyAwarded: true },
      });
    }

    const correct = selectedOption === quizQuestion.correct_option;
    const { data: answerRow, error: insertError } = await supabaseAdmin
      .from("user_quiz_answers")
      .insert({
        user_id: userId,
        quiz_id: quizId,
        quiz_question_id: quizQuestionId,
        selected_option: selectedOption,
        correct,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Erro ao salvar resposta do quiz: ${insertError.message}`);
    }

    const eventId = crypto.randomUUID();
    const answeredAt = answerRow.answered_at ?? new Date().toISOString();
    const { error: eventError } = await supabaseAdmin
      .from("user_profile_events")
      .insert({
        id: eventId,
        user_id: userId,
        event_type: "QUIZ_COMPLETED",
        source: "adventure",
        source_table: "user_quiz_answers",
        source_id: answerRow.id,
        payload: {
          quiz_id: quizId,
          quiz_question_id: quizQuestionId,
          selected_option: selectedOption,
          correct,
          category: quizQuestion.category,
          difficulty: quizQuestion.difficulty,
          signal_key: quizQuestion.signal_key,
        },
        metadata: {
          schema_version: ADVENTURE_SCHEMA_VERSION,
          algorithm: ADVENTURE_ALGORITHM_VERSION,
        },
        schema_version: ADVENTURE_SCHEMA_VERSION,
        occurred_at: answeredAt,
      });

    if (eventError) {
      throw new Error(`Erro ao gravar evento do quiz: ${eventError.message}`);
    }

    const quizFact = buildQuizFact(quizQuestion as any, correct, selectedOption, eventId);
    const { error: factError } = await supabaseAdmin
      .from("user_profile_facts")
      .upsert(
        {
          ...quizFact,
          user_id: userId,
          last_seen_at: answeredAt,
          updated_at: answeredAt,
        },
        { onConflict: "user_id,fact_key" },
      );

    if (factError) {
      throw new Error(`Erro ao gravar fato do quiz: ${factError.message}`);
    }

    const xp = await awardXpWithDailyCap(supabaseAdmin, {
      userId,
      sourceType: "adventure_quiz",
      sourceId: answerRow.id,
      reason: correct ? "Quiz da Aventura correto" : "Quiz da Aventura revisado",
      requestedXp: correct ? QUIZ_CORRECT_XP : QUIZ_REVIEW_XP,
      idempotencyKey: `adventure_quiz:${answerRow.id}`,
      dailyCap: QUIZ_DAILY_XP_CAP,
      dailyCapSourceTypes: ["adventure_quiz"],
      metadata: {
        correct,
        selected_option: selectedOption,
        category: quizQuestion.category,
        quiz_question_id: quizQuestionId,
      },
    });
    const achievements = await unlockEligibleAchievements(supabaseAdmin, userId, "answer-adventure-quiz");

    return jsonResponse({
      success: true,
      correct,
      explanation: quizQuestion.explanation,
      correct_option: quizQuestion.correct_option,
      xp,
      achievements,
    });
  } catch (error: any) {
    console.error("[ADVENTURE] Erro ao responder quiz:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
