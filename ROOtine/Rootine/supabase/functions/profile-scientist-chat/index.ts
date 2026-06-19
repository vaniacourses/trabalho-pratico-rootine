import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

const SCIENTIST_RATE_LIMIT_PER_HOUR = 12;
const EDUCATIONAL_NOTICE =
  "Resposta educativa. Não substitui orientação médica, legal, financeira ou profissional especializada.";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hasAiKey() {
  return Boolean(
    Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPEN_AI_KEY") ?? Deno.env.get("GROQ_API_KEY"),
  );
}

function aiRuntimeSummary() {
  if (Deno.env.get("GROQ_API_KEY")) {
    return {
      ai_provider: "groq",
      ai_model: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
    };
  }

  if (Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPEN_AI_KEY")) {
    return {
      ai_provider: "openai",
      ai_model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
    };
  }

  return { ai_provider: null, ai_model: null };
}

function impactTotals(rows: Array<{ impact: unknown }>) {
  return rows.reduce(
    (acc, row) => {
      const impact = asObject(row.impact);
      for (const key of ["water_l", "co2_kg", "waste_g", "energy_kwh"] as const) {
        const range = asObject(impact[key]);
        acc[key] += numberValue(range.mid, 0);
      }
      return acc;
    },
    { water_l: 0, co2_kg: 0, waste_g: 0, energy_kwh: 0 },
  );
}

function sanitizeQuestion(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function buildFallbackAnswer(context: Record<string, unknown>) {
  const missionSummary = asObject(context.missions);
  const completed = numberValue(missionSummary.completed, 0);
  const refused = numberValue(missionSummary.refused, 0);
  const failed = numberValue(missionSummary.failed, 0);
  const factKeys = Array.isArray(context.fact_keys) ? context.fact_keys.slice(0, 4).join(", ") : "";

  return {
    answer:
      `Com base no resumo disponível, você tem ${completed} missão(ões) concluída(s), ${refused} recusada(s) e ${failed} não concluída(s). Um bom próximo passo é escolher uma ação pequena, sem custo e com limite claro de tempo; depois observe se ela foi fácil, difícil ou inviável. ${factKeys ? `Fatos usados como referência: ${factKeys}.` : ""}\n\n${EDUCATIONAL_NOTICE}`,
    protocols: [
      {
        title: "Protocolo simples de ajuste",
        steps: [
          "Escolha uma ação ambiental que caiba no tempo disponível hoje.",
          "Faça a menor versão segura e sem compra nova.",
          "Se falhar, reduza tempo ou dificuldade; se for fácil, transforme em missão semanal.",
        ],
      },
    ],
    referenced_context: Array.isArray(context.fact_keys) ? context.fact_keys.slice(0, 6) : [],
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const { userId, message } = await req.json();
    const question = sanitizeQuestion(message);

    if (!userId || !question) {
      throw new Error("Parâmetros obrigatórios: userId, message");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count: recentCount, error: countError } = await supabaseAdmin
      .from("agent_interactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("agent", "scientist")
      .eq("event_type", "SCIENTIST_CHAT")
      .gte("created_at", since);

    if (countError) throw new Error(`Erro ao verificar rate limit: ${countError.message}`);

    if ((recentCount ?? 0) >= SCIENTIST_RATE_LIMIT_PER_HOUR) {
      await logAgentInteraction(supabaseAdmin, {
        userId,
        agent: "scientist",
        eventType: "SCIENTIST_CHAT",
        inputSummary: {
          messageLength: question.length,
          rateLimitCount: recentCount ?? 0,
        },
        output: { rate_limited: true },
        status: "error",
        errorMessage: "rate_limited",
      });

      console.log("[SCIENTIST] Rate limit atingido.", {
        userId,
        recentCount,
        limit: SCIENTIST_RATE_LIMIT_PER_HOUR,
      });

      return jsonResponse({
        error: "rate_limited",
        message: "Você atingiu o limite de perguntas ao Cientista nesta hora. Tente novamente mais tarde.",
      }, 429);
    }

    const [
      { data: profile },
      { data: facts },
      { data: missions },
      { data: xpRows },
      { data: impactRows },
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("xp, socioeconomic_context, learned_preferences, affinities")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_profile_facts")
        .select("fact_key, fact_type, category, confidence, active, last_seen_at")
        .eq("user_id", userId)
        .eq("active", true)
        .order("last_seen_at", { ascending: false })
        .limit(24),
      supabaseAdmin
        .from("user_missions")
        .select("status, category, difficulty, mission_type, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("xp_ledger")
        .select("source_type, xp_delta, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(80),
      supabaseAdmin
        .from("impact_ledger")
        .select("impact, logged_at")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(80),
    ]);

    const factRows = (facts ?? []) as Array<Record<string, unknown>>;
    const missionRows = (missions ?? []) as Array<Record<string, unknown>>;
    const xpTotal = (xpRows ?? []).reduce((sum: number, row: Record<string, unknown>) =>
      sum + numberValue(row.xp_delta, 0), 0);
    const contextSummary = {
      schema_version: "ScientistContextV2",
      profile: {
        xp: numberValue(profile?.xp, 0),
        time_availability: asObject(profile?.socioeconomic_context).time_availability ?? null,
        financial_friction: asObject(profile?.socioeconomic_context).financial_friction ?? null,
        affinity_categories: Object.keys(asObject(profile?.affinities)).slice(0, 6),
      },
      facts: factRows.map((fact) => ({
        fact_key: fact.fact_key,
        fact_type: fact.fact_type,
        category: fact.category,
        confidence: fact.confidence,
      })),
      fact_keys: factRows.map((fact) => fact.fact_key).filter((key): key is string => typeof key === "string"),
      missions: {
        completed: missionRows.filter((mission) => mission.status === "completed").length,
        refused: missionRows.filter((mission) => mission.status === "refused").length,
        failed: missionRows.filter((mission) => mission.status === "failed").length,
        active: missionRows.filter((mission) => mission.status === "active").length,
        recent_categories: missionRows.map((mission) => mission.category).filter(Boolean).slice(0, 12),
      },
      xp: {
        recent_positive_total: xpTotal,
        source_types: [...new Set((xpRows ?? []).map((row: Record<string, unknown>) => row.source_type))].slice(0, 8),
      },
      impact: impactTotals((impactRows ?? []) as Array<{ impact: unknown }>),
    };

    console.log("[SCIENTIST] Chat solicitado.", {
      userId,
      messageLength: question.length,
      factCount: factRows.length,
      missionCount: missionRows.length,
      ai_available: hasAiKey(),
      ...aiRuntimeSummary(),
    });

    const fallback = buildFallbackAnswer(contextSummary);
    const aiResult = await runJsonAgent({
      role: "scientist",
      task: `Responda como Cientista do Rootine em português brasileiro.
Regras:
- Use apenas o contexto resumido permitido.
- Não altere perfil, fatos, missões ou preferências.
- Seja educativo, prático e conservador.
- Não dê instrução médica, legal ou financeira; inclua o aviso educativo.
- Não invente dados que não estejam no contexto.
JSON esperado:
{
  "answer": "string",
  "protocols": [
    { "title": "string", "steps": ["string"] }
  ],
  "referenced_context": ["fact_key ou métrica usada"]
}`,
      context: {
        user_question: question,
        context_summary: contextSummary,
        educational_notice: EDUCATIONAL_NOTICE,
      },
      fallback,
    }) as any;

    const usedFallback = Boolean(aiResult?._fallback_reason);
    const answer = String(aiResult?.answer ?? fallback.answer);
    const normalizedAnswer = answer.includes(EDUCATIONAL_NOTICE)
      ? answer
      : `${answer}\n\n${EDUCATIONAL_NOTICE}`;
    const protocols = Array.isArray(aiResult?.protocols) ? aiResult.protocols : fallback.protocols;
    const referencedContext = Array.isArray(aiResult?.referenced_context)
      ? aiResult.referenced_context.slice(0, 12)
      : fallback.referenced_context;

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "scientist",
      eventType: "SCIENTIST_CHAT",
      inputSummary: {
        messageLength: question.length,
        factKeys: contextSummary.fact_keys.slice(0, 12),
        missionCount: missionRows.length,
        rateLimitCount: recentCount ?? 0,
        ai_used: !usedFallback,
        ai_stage: "profile_scientist_chat",
        ...aiRuntimeSummary(),
      },
      output: {
        answer_length: normalizedAnswer.length,
        protocol_count: protocols.length,
        referenced_context: referencedContext,
        ai_used: !usedFallback,
        fallback_reason: usedFallback ? String(aiResult._fallback_reason) : null,
      },
      status: usedFallback ? "error" : "success",
      errorMessage: usedFallback ? String(aiResult._fallback_reason) : undefined,
    });

    console.log("[SCIENTIST] Chat concluído.", {
      userId,
      ai_used: !usedFallback,
      ai_stage: "profile_scientist_chat",
      fallback_reason: usedFallback ? String(aiResult._fallback_reason) : null,
      elapsedMs: Date.now() - startedAt,
    });

    return jsonResponse({
      success: true,
      answer: normalizedAnswer,
      protocols,
      referenced_context: referencedContext,
      educational_notice: EDUCATIONAL_NOTICE,
      ai_used: !usedFallback,
      fallback_reason: usedFallback ? String(aiResult._fallback_reason) : null,
      rate_limit: {
        used: (recentCount ?? 0) + 1,
        limit: SCIENTIST_RATE_LIMIT_PER_HOUR,
      },
    });
  } catch (error: any) {
    console.error("[SCIENTIST] Erro no chat:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
