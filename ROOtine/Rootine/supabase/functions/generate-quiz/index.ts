import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_SCHEMA_VERSION,
  isoDaysAgo,
  selectDeterministicQuizQuestion,
} from "../_shared/adventure.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    if (!userId) throw new Error("O parâmetro 'userId' é obrigatório.");

    await requireUserIdFromJwt(req, userId);

    const supabaseAdmin = createSupabaseAdmin();
    console.log("[ADVENTURE] Selecionando quiz determinístico.", { userId });

    const [{ data: profile }, { data: questions, error: questionsError }, { data: recentAnswers }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("xp, affinities")
          .eq("id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("quiz_questions")
          .select("id, category, question, options, correct_option, explanation, difficulty, signal_key, metadata")
          .eq("active", true),
        supabaseAdmin
          .from("user_quiz_answers")
          .select("quiz_question_id")
          .eq("user_id", userId)
          .not("quiz_question_id", "is", null)
          .gte("answered_at", isoDaysAgo(7)),
      ]);

    if (questionsError) {
      throw new Error(`Erro ao buscar quiz_questions: ${questionsError.message}`);
    }

    if (!questions?.length) {
      throw new Error("Nenhuma quiz_question ativa disponível.");
    }

    const recentQuestionIds = new Set(
      (recentAnswers ?? [])
        .map((answer: any) => answer.quiz_question_id)
        .filter((id: unknown): id is string => typeof id === "string"),
    );

    const selected = selectDeterministicQuizQuestion(
      questions as any,
      recentQuestionIds,
      profile?.affinities ?? {},
      userId,
    );

    if (!selected) {
      throw new Error("Não foi possível selecionar um quiz determinístico.");
    }

    const options = Array.isArray(selected.options) ? selected.options.slice(0, 4) : [];
    if (options.length !== 4) {
      throw new Error(`quiz_question sem 4 alternativas: ${selected.id}`);
    }

    const { data: quiz, error: insertErr } = await supabaseAdmin
      .from("quizzes")
      .insert({
        user_id: userId,
        question: selected.question,
        options,
        correct_option: selected.correct_option,
        explanation: selected.explanation,
        category: selected.category,
      })
      .select()
      .single();

    if (insertErr) {
      throw new Error(`Erro ao criar snapshot do quiz: ${insertErr.message}`);
    }

    console.log("[ADVENTURE] Quiz selecionado.", {
      userId,
      quizId: quiz.id,
      quizQuestionId: selected.id,
      category: selected.category,
      difficulty: selected.difficulty,
      recentAvoided: recentQuestionIds.size,
    });

    return jsonResponse({
      success: true,
      persisted: true,
      source: "quiz_questions",
      algorithm: ADVENTURE_ALGORITHM_VERSION,
      quiz: {
        ...quiz,
        quiz_question_id: selected.id,
        difficulty: selected.difficulty,
        signal_key: selected.signal_key,
        schema_version: ADVENTURE_SCHEMA_VERSION,
      },
    });
  } catch (error: any) {
    console.error("[ADVENTURE] Erro ao gerar quiz:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
