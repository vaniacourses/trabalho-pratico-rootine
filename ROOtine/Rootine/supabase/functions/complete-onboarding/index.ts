import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildOnboardingAffinities,
  buildOnboardingLearnedPreferences,
  buildOnboardingSocioeconomicContext,
  deriveOnboardingFacts,
  getOnboardingAnswerSummaries,
  normalizeOnboardingAnswers,
  ONBOARDING_ALGORITHM_VERSION,
  ONBOARDING_SCHEMA_VERSION,
  validateOnboardingAnswers,
  type OnboardingAnswers,
  type OnboardingQuestionId,
} from "../_shared/onboarding.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";
import { unlockEligibleAchievements } from "../_shared/progress.ts";

interface CompleteOnboardingPayload {
  userId: string;
  answers: Record<string, unknown>;
}

function getProfileName(user: Awaited<ReturnType<typeof requireUserIdFromJwt>>) {
  const metadata = user.user_metadata ?? {};
  const metadataName =
    typeof metadata.name === "string"
      ? metadata.name
      : typeof metadata.full_name === "string"
        ? metadata.full_name
        : "";

  return metadataName.trim() || user.email?.split("@")[0] || "Guardião";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as CompleteOnboardingPayload;
    const userId = body.userId;

    if (!userId) {
      throw new Error("O parâmetro 'userId' é obrigatório.");
    }

    const user = await requireUserIdFromJwt(req, userId);
    const answers = normalizeOnboardingAnswers(body.answers ?? {});
    console.log("[ONBOARDING] Requisição recebida.", {
      userId,
      answerCount: Object.keys(answers).length,
    });

    const validation = validateOnboardingAnswers(answers);

    if (!validation.valid) {
      console.warn("[ONBOARDING] Respostas inválidas.", {
        userId,
        errors: validation.errors,
      });

      return jsonResponse(
        {
          error: "onboarding_answers_invalid",
          details: validation.errors,
        },
        400,
      );
    }

    const completeAnswers = answers as Required<OnboardingAnswers>;
    const generatedAt = new Date().toISOString();
    const supabaseAdmin = createSupabaseAdmin();

    const { data: existingProfile, error: profileSelectError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, xp")
      .eq("id", userId)
      .maybeSingle();

    if (profileSelectError) {
      throw new Error(`Erro ao buscar perfil: ${profileSelectError.message}`);
    }

    if (!existingProfile) {
      const { error: profileInsertError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: userId,
          name: getProfileName(user),
          xp: 0,
          onboarding_completed: false,
        });

      if (profileInsertError) {
        throw new Error(`Erro ao criar perfil: ${profileInsertError.message}`);
      }
    }

    const answerEventIds: Partial<Record<OnboardingQuestionId, string>> = {};
    const answerSummaries = getOnboardingAnswerSummaries(completeAnswers);
    const answerEvents = answerSummaries.map((summary) => {
      const eventId = crypto.randomUUID();
      answerEventIds[summary.question_id] = eventId;

      return {
        id: eventId,
        user_id: userId,
        event_type: "ONBOARDING_ANSWERED",
        source: "diagnostic",
        payload: {
          question_id: summary.question_id,
          question_label: summary.question_label,
          answer_value: summary.answer_value,
          answer_label: summary.answer_label,
          index: summary.index,
        },
        metadata: {
          schema_version: ONBOARDING_SCHEMA_VERSION,
          algorithm: ONBOARDING_ALGORITHM_VERSION,
        },
        schema_version: ONBOARDING_SCHEMA_VERSION,
        occurred_at: generatedAt,
      };
    });

    const completedEventId = crypto.randomUUID();
    const completedEvent = {
      id: completedEventId,
      user_id: userId,
      event_type: "ONBOARDING_COMPLETED",
      source: "diagnostic",
      payload: {
        question_count: answerSummaries.length,
      },
      metadata: {
        schema_version: ONBOARDING_SCHEMA_VERSION,
        algorithm: ONBOARDING_ALGORITHM_VERSION,
      },
      schema_version: ONBOARDING_SCHEMA_VERSION,
      occurred_at: generatedAt,
    };

    const { error: eventsError } = await supabaseAdmin
      .from("user_profile_events")
      .insert([...answerEvents, completedEvent]);

    if (eventsError) {
      throw new Error(`Erro ao gravar eventos do onboarding: ${eventsError.message}`);
    }

    console.log("[ONBOARDING] Eventos gravados.", {
      userId,
      eventCount: answerEvents.length + 1,
    });

    const factRows = deriveOnboardingFacts(completeAnswers).map((profileFact) => ({
      user_id: userId,
      fact_key: profileFact.fact_key,
      fact_type: profileFact.fact_type,
      category: profileFact.category,
      value: profileFact.value,
      confidence: profileFact.confidence,
      source_event_ids: answerEventIds[profileFact.source_question_id]
        ? [answerEventIds[profileFact.source_question_id]]
        : [],
      active: true,
      derived_by: ONBOARDING_ALGORITHM_VERSION,
      evidence_count: 1,
      last_seen_at: generatedAt,
      updated_at: generatedAt,
    }));

    const { error: factsError } = await supabaseAdmin
      .from("user_profile_facts")
      .upsert(factRows, { onConflict: "user_id,fact_key" });

    if (factsError) {
      throw new Error(`Erro ao gravar fatos do onboarding: ${factsError.message}`);
    }

    console.log("[ONBOARDING] Fatos derivados sem IA gravados.", {
      userId,
      factCount: factRows.length,
      algorithm: ONBOARDING_ALGORITHM_VERSION,
    });

    const socioeconomicContext = buildOnboardingSocioeconomicContext(
      completeAnswers,
      generatedAt,
    );
    const learnedPreferences = buildOnboardingLearnedPreferences(
      completeAnswers,
      generatedAt,
    );
    const affinities = buildOnboardingAffinities(completeAnswers);

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        name: existingProfile?.name || getProfileName(user),
        socioeconomic_context: socioeconomicContext,
        learned_preferences: learnedPreferences,
        affinities,
        onboarding_completed: true,
      })
      .eq("id", userId);

    if (profileUpdateError) {
      throw new Error(`Erro ao atualizar perfil: ${profileUpdateError.message}`);
    }

    console.log("[ONBOARDING] Perfil atualizado e onboarding concluído.", {
      userId,
      schemaVersion: ONBOARDING_SCHEMA_VERSION,
      algorithm: ONBOARDING_ALGORITHM_VERSION,
    });

    const achievements = await unlockEligibleAchievements(supabaseAdmin, userId, "complete-onboarding");

    return jsonResponse({
      success: true,
      event_count: answerEvents.length + 1,
      fact_count: factRows.length,
      onboarding_completed: true,
      achievements,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ONBOARDING] Erro:", message);
    return jsonResponse({ error: message }, getErrorStatus(error));
  }
});
