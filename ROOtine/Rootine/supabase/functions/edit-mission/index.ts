import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { allowedCategories, logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";
import { unlockEligibleAchievements } from "../_shared/progress.ts";
import {
  asObject,
  clamp,
  type FeedbackClassificationV1,
  hasUsefulStructuredFeedback,
  MISSION_EDIT_ALGORITHM_VERSION,
  MISSION_EDIT_SCHEMA_VERSION,
  normalizeFeedbackClassification,
  normalizeText,
  numberValue,
  stableHash,
  stringArray,
  summarizeFeedback,
} from "../_shared/mission-edit.ts";

const COST_ORDER = ["free", "low", "medium", "high"] as const;
const XP_REWARD_BY_DIFFICULTY: Record<number, number> = {
  1: 10,
  2: 16,
  3: 25,
  4: 40,
  5: 60,
};

type Category = typeof allowedCategories[number];
type CostLevel = typeof COST_ORDER[number];
type MissionType = "daily" | "specialized";

interface PatternRow {
  key: string;
  action_fingerprint: string;
  category: Category;
  environmental_goal: string;
  difficulty_min: number;
  difficulty_max: number;
  cost_level: CostLevel;
  effort_minutes_min: number;
  effort_minutes_max: number;
  required_or_helpful_fact_types: string[];
  disqualifying_fact_keys: string[];
  personalization_slots: string[];
  impact_model_key: string;
  recurrence_allowed: boolean;
  fallback_title_pt: string;
  fallback_description_pt: string;
  fallback_reason_pt: string;
  metadata?: Record<string, unknown> | null;
}

interface ProfileFact {
  fact_key: string;
  fact_type: string;
  category: Category | null;
  value: Record<string, unknown>;
  confidence: number;
  active?: boolean;
}

interface EditedMissionCandidate {
  title: string;
  description: string;
  category: Category;
  environmental_goal: string;
  difficulty: number;
  effort_minutes: number;
  cost_level: CostLevel;
  xp_reward: number;
  used_fact_keys: string[];
  personalization_reason: string;
  expected_impact: Record<string, unknown>;
  pattern_key: string;
  action_fingerprint: string;
  mission_type: MissionType;
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && allowedCategories.includes(value as Category);
}

function isCostLevel(value: unknown): value is CostLevel {
  return typeof value === "string" && COST_ORDER.includes(value as CostLevel);
}

function isMissionType(value: unknown): value is MissionType {
  return value === "daily" || value === "specialized";
}

function costRank(value: unknown) {
  const index = COST_ORDER.indexOf(value as CostLevel);
  return index >= 0 ? index : COST_ORDER.length - 1;
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

function deriveActionFingerprint(pattern: Record<string, unknown>) {
  const explicit = typeof pattern.action_fingerprint === "string"
    ? pattern.action_fingerprint.trim()
    : "";
  if (explicit) return explicit;

  const metadata = asObject(pattern.metadata);
  const metadataFingerprint = typeof metadata.action_fingerprint === "string"
    ? metadata.action_fingerprint.trim()
    : "";
  if (metadataFingerprint) return metadataFingerprint;

  return typeof pattern.key === "string" && pattern.key.trim() ? pattern.key.trim() : "unknown.action";
}

function timeBudgetFromProfile(profile: Record<string, unknown>, missionType: MissionType) {
  const context = asObject(profile.socioeconomic_context);
  const routine = asObject(context.routine);
  const time = String(context.time_availability ?? routine.free_time ?? "");

  const base = time === "micro"
    ? 5
    : time === "short"
      ? 15
      : time === "medium"
        ? 30
        : 45;

  return missionType === "specialized" ? Math.min(base * 2, 90) : base;
}

function maxCostFromProfile(profile: Record<string, unknown>) {
  const context = asObject(profile.socioeconomic_context);
  const friction = String(context.financial_friction ?? "");
  if (friction === "high") return "free";
  if (friction === "medium") return "low";
  return "medium";
}

function zeroImpact() {
  return {
    water_l: { low: 0, mid: 0, high: 0, confidence: 0.2 },
    co2_kg: { low: 0, mid: 0, high: 0, confidence: 0.2 },
    waste_g: { low: 0, mid: 0, high: 0, confidence: 0.2 },
    energy_kwh: { low: 0, mid: 0, high: 0, confidence: 0.2 },
  };
}

function impactEstimate(pattern: PatternRow, difficulty: number) {
  const impact = zeroImpact();
  const factor = Math.max(1, difficulty);
  const key = pattern.impact_model_key;

  if (pattern.category === "water" || key.includes("water")) {
    impact.water_l = { low: 2 * factor, mid: 6 * factor, high: 12 * factor, confidence: 0.45 };
  }
  if (pattern.category === "energy" || key.includes("energy")) {
    impact.energy_kwh = { low: 0.04 * factor, mid: 0.12 * factor, high: 0.3 * factor, confidence: 0.42 };
    impact.co2_kg = { low: 0.01 * factor, mid: 0.04 * factor, high: 0.1 * factor, confidence: 0.35 };
  }
  if (pattern.category === "waste" || key.includes("waste")) {
    impact.waste_g = { low: 40 * factor, mid: 120 * factor, high: 260 * factor, confidence: 0.48 };
  }
  if (pattern.category === "transport" || key.includes("transport") || key.includes("co2")) {
    impact.co2_kg = { low: 0.1 * factor, mid: 0.45 * factor, high: 1.2 * factor, confidence: 0.4 };
  }
  if (pattern.category === "food") {
    impact.waste_g = { low: 30 * factor, mid: 110 * factor, high: 240 * factor, confidence: 0.44 };
    impact.water_l = { low: 1 * factor, mid: 4 * factor, high: 10 * factor, confidence: 0.32 };
  }
  if (pattern.category === "consumption") {
    impact.waste_g = { low: 20 * factor, mid: 90 * factor, high: 220 * factor, confidence: 0.38 };
    impact.co2_kg = { low: 0.02 * factor, mid: 0.18 * factor, high: 0.55, confidence: 0.28 };
  }

  return impact;
}

function hasPositiveImpact(impact: Record<string, any>) {
  return Object.values(impact).some((range: any) =>
    Number(range?.mid ?? 0) > 0 || Number(range?.high ?? 0) > 0
  );
}

function blockedActionMentioned(text: string, blockedAction: string) {
  const normalizedText = normalizeText(text);
  const normalizedAction = normalizeText(blockedAction).replace(/[_.-]+/g, " ");
  const actionTokens = normalizedAction.split(/\s+/).filter((token) => token.length > 2);

  if (actionTokens.some((token) => ["bike", "bicicleta", "pedalar", "ciclismo"].includes(token))) {
    return /\b(bike|bicicleta|pedalar|ciclovia|ciclismo)\b/.test(normalizedText);
  }
  if (actionTokens.some((token) => ["carona", "caronas", "carpool", "compartilhar", "compartir"].includes(token))) {
    return /\b(carona|caronas|carpool|compartilhar carona|compartir caronas)\b/.test(normalizedText);
  }

  return normalizedAction.length >= 4 && normalizedText.includes(normalizedAction);
}

function factLabel(fact: ProfileFact) {
  const value = asObject(fact.value);
  if (typeof value.label === "string") return value.label;
  if (typeof value.signal_key === "string") return value.signal_key;
  return fact.fact_key;
}

function buildIssueDescription(input: {
  pattern: PatternRow;
  classification: FeedbackClassificationV1;
  effortMinutes: number;
  factSummary: string;
}) {
  const { pattern, classification, effortMinutes, factSummary } = input;

  switch (classification.issue_type) {
    case "health":
      if (pattern.category === "water") {
        return "Hoje, mantenha intacta qualquer etapa de cuidado, remédio ou segurança. Se houver um momento em que a água corrente não é necessária, pause por até 1 minuto; se isso interferir no cuidado, apenas observe onde a água fica aberta sem agir.";
      }
      return `${pattern.fallback_description_pt} Faça apenas se não interferir em cuidado de saúde, remédio ou segurança.`;
    case "safety":
      return `${pattern.fallback_description_pt} Faça em ambiente seguro e conhecido; se rua, clima ou acesso parecerem inseguros, adapte para uma observação doméstica.`;
    case "access":
      return `${pattern.fallback_description_pt} Use apenas itens, espaços ou decisões que estejam sob seu controle direto.`;
    case "cost":
      return `${pattern.fallback_description_pt} Use somente recursos que você já tem e não compre nada para concluir.`;
    case "time":
      return `${pattern.fallback_description_pt} Faça uma versão curta, em até ${effortMinutes} minutos, no momento mais leve da rotina.`;
    case "already_doing":
      return `${pattern.fallback_description_pt} Como essa ação já existe na sua rotina, registre uma melhoria pequena ou um detalhe que torne o hábito mais consistente.`;
    case "too_easy":
      return `${pattern.fallback_description_pt} Acrescente uma observação simples do resultado para tornar a missão um pouco mais desafiadora sem aumentar custo.`;
    case "too_hard":
      return `${pattern.fallback_description_pt} Reduza para o menor passo possível hoje e pare assim que a ação deixar de ser viável.`;
    case "preference":
      return `${pattern.fallback_description_pt} Ajuste o objeto ou o horário da ação ao que funciona melhor para você.`;
    default:
      return `${pattern.fallback_description_pt} Faça uma versão conservadora e segura, usando o fato "${factSummary}" como limite.`;
  }
}

function selectPatternForEdit(input: {
  mission: Record<string, unknown>;
  patterns: PatternRow[];
  classification: FeedbackClassificationV1;
  profile: Record<string, unknown>;
}) {
  const { mission, patterns, classification, profile } = input;
  const missionCategory = isCategory(mission.category) ? mission.category : null;
  const missionType = isMissionType(mission.mission_type) ? mission.mission_type : "daily";
  const currentDifficulty = clamp(Math.round(numberValue(mission.difficulty, 1)), 1, 5);
  const currentEffort = numberValue(mission.effort_minutes, timeBudgetFromProfile(profile, missionType));
  const currentPatternKey = typeof mission.pattern_key === "string" ? mission.pattern_key : null;
  const currentAction = typeof mission.action_fingerprint === "string" ? mission.action_fingerprint : null;
  const maxCost = maxCostFromProfile(profile);
  const timeBudget = timeBudgetFromProfile(profile, missionType);
  const blockedActions = new Set([
    ...classification.blocked_actions,
    ...(classification.issue_type === "access" || classification.issue_type === "safety" ? [currentAction] : []),
  ].filter((value): value is string => typeof value === "string" && value.length > 0));

  const primary = patterns.filter((pattern) => !missionCategory || pattern.category === missionCategory);
  const pool = primary.length ? primary : patterns;

  const ranked = pool
    .filter((pattern) => ![...blockedActions].some((blockedAction) =>
      pattern.action_fingerprint === blockedAction ||
      blockedActionMentioned(
        `${pattern.action_fingerprint} ${pattern.key} ${pattern.fallback_title_pt} ${pattern.fallback_description_pt}`,
        blockedAction,
      )
    ))
    .map((pattern) => {
      let score = 0;
      if (pattern.key === currentPatternKey) score += 10;
      if (pattern.category === missionCategory) score += 12;
      if (costRank(pattern.cost_level) <= costRank(maxCost)) score += 8;
      if (pattern.effort_minutes_min <= timeBudget) score += 8;

      if (classification.issue_type === "cost") {
        if (pattern.cost_level === "free") score += 30;
        if (costRank(pattern.cost_level) > costRank("free")) score -= 40;
      }
      if (classification.issue_type === "time" || classification.issue_type === "too_hard") {
        score -= Math.max(0, pattern.effort_minutes_min - Math.min(currentEffort, timeBudget));
        if (pattern.difficulty_min <= currentDifficulty) score += 15;
      }
      if (classification.issue_type === "already_doing" || classification.issue_type === "too_easy") {
        if (pattern.key !== currentPatternKey) score += 20;
        if (pattern.difficulty_min >= Math.min(5, currentDifficulty + 1)) score += 12;
      }
      if (classification.issue_type === "health" && pattern.key === "water.shower_pause_safe") score += 40;
      if (classification.issue_type === "access" && pattern.key !== currentPatternKey) score += 18;
      if (classification.issue_type === "safety" && pattern.effort_minutes_min <= 10) score += 8;

      score -= Math.abs(pattern.difficulty_min - currentDifficulty) * 2;
      return { pattern, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.pattern ?? pool[0] ?? patterns[0] ?? null;
}

function buildEditedCandidate(input: {
  mission: Record<string, unknown>;
  pattern: PatternRow;
  facts: ProfileFact[];
  classification: FeedbackClassificationV1;
  profile: Record<string, unknown>;
}) {
  const { mission, pattern, facts, classification, profile } = input;
  const missionType = isMissionType(mission.mission_type) ? mission.mission_type : "daily";
  const timeBudget = timeBudgetFromProfile(profile, missionType);
  const currentDifficulty = clamp(Math.round(numberValue(mission.difficulty, pattern.difficulty_min)), 1, 5);
  const currentEffort = numberValue(mission.effort_minutes, pattern.effort_minutes_min);

  let difficulty = clamp(currentDifficulty, pattern.difficulty_min, pattern.difficulty_max);
  if (classification.issue_type === "too_easy" || classification.issue_type === "already_doing") {
    difficulty = clamp(Math.max(difficulty, pattern.difficulty_min), 1, pattern.difficulty_max);
  }
  if (classification.issue_type === "time" || classification.issue_type === "too_hard" || classification.issue_type === "health") {
    difficulty = clamp(Math.min(difficulty, pattern.difficulty_min), 1, pattern.difficulty_max);
  }

  const effortTarget = classification.issue_type === "time" || classification.issue_type === "too_hard"
    ? Math.min(currentEffort, timeBudget, pattern.effort_minutes_max)
    : Math.min(Math.max(pattern.effort_minutes_min, currentEffort), pattern.effort_minutes_max, timeBudget);
  const effortMinutes = clamp(
    Math.round(effortTarget || pattern.effort_minutes_min),
    Math.max(1, pattern.effort_minutes_min),
    Math.max(1, pattern.effort_minutes_max),
  );

  const categoryFacts = facts
    .filter((fact) => fact.category === pattern.category || fact.category === null)
    .sort((left, right) => numberValue(right.confidence, 0) - numberValue(left.confidence, 0));
  const activeFactKeys = new Set(facts.map((fact) => fact.fact_key));
  const previousFactKeys = stringArray(mission.used_fact_keys).filter((factKey) => activeFactKeys.has(factKey));
  const feedbackFactKeys = classification.new_fact_candidates.map((fact) => fact.fact_key);
  const usedFactKeys = [...new Set([
    ...feedbackFactKeys,
    ...previousFactKeys,
    ...categoryFacts.map((fact) => fact.fact_key),
  ])].slice(0, 5);
  const safeUsedFactKeys = usedFactKeys.length
    ? usedFactKeys
    : [`feedback.${pattern.category}.mission_edit.context.${pattern.action_fingerprint}`];
  const factSummary = categoryFacts[0] ? factLabel(categoryFacts[0]) : classification.raw_text_summary;
  const expectedImpact = impactEstimate(pattern, difficulty);
  const costLevel = classification.issue_type === "cost" ? "free" : pattern.cost_level;

  return {
    title: pattern.fallback_title_pt,
    description: buildIssueDescription({ pattern, classification, effortMinutes, factSummary }),
    category: pattern.category,
    environmental_goal: pattern.environmental_goal,
    difficulty,
    effort_minutes: effortMinutes,
    cost_level: isCostLevel(costLevel) ? costLevel : "free",
    xp_reward: XP_REWARD_BY_DIFFICULTY[difficulty] ?? 10,
    used_fact_keys: safeUsedFactKeys,
    personalization_reason:
      `${pattern.fallback_reason_pt} A edição tratou o feedback como restrição (${classification.issue_type}) e preservou impacto ambiental positivo sem criar hard block automático.`,
    expected_impact: expectedImpact,
    pattern_key: pattern.key,
    action_fingerprint: pattern.action_fingerprint,
    mission_type: missionType,
  } satisfies EditedMissionCandidate;
}

function validateEditedMission(candidate: EditedMissionCandidate, facts: ProfileFact[], classification: FeedbackClassificationV1) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!candidate.title || candidate.title.trim().length < 4) errors.push("title_required");
  if (!candidate.description || candidate.description.trim().length < 20) errors.push("description_required");
  if (!isCategory(candidate.category)) errors.push("category_invalid");
  if (!isCostLevel(candidate.cost_level)) errors.push("cost_level_invalid");
  if (!Number.isInteger(candidate.difficulty) || candidate.difficulty < 1 || candidate.difficulty > 5) {
    errors.push("difficulty_invalid");
  }
  if (!Number.isFinite(candidate.effort_minutes) || candidate.effort_minutes < 0 || candidate.effort_minutes > 240) {
    errors.push("effort_minutes_invalid");
  }
  if (!candidate.pattern_key) errors.push("pattern_key_required");
  if (!candidate.action_fingerprint) errors.push("action_fingerprint_required");
  if (!candidate.used_fact_keys.length) errors.push("used_fact_keys_required");
  if (!candidate.personalization_reason || candidate.personalization_reason.trim().length < 20) {
    errors.push("personalization_reason_required");
  }
  if (!hasPositiveImpact(candidate.expected_impact as any)) {
    errors.push("expected_impact_must_have_positive_metric");
  }

  const goalText = normalizeText(candidate.environmental_goal);
  if (!/(reduzir|evitar|economizar|reutilizar|reciclar|separar|consertar|diminuir|desperdicio|emissao|agua|energia|consumo)/.test(goalText)) {
    errors.push("environmental_goal_not_positive_or_explicit");
  }

  const knownFactKeys = new Set([
    ...facts.map((fact) => fact.fact_key),
    ...classification.new_fact_candidates.map((fact) => fact.fact_key),
  ]);
  for (const factKey of candidate.used_fact_keys) {
    if (!factKey.startsWith("cold_start.") && !factKey.startsWith("feedback.") && !knownFactKeys.has(factKey)) {
      errors.push(`used_fact_key_not_found:${factKey}`);
    }
  }

  const text = normalizeText(`${candidate.title} ${candidate.description} ${candidate.personalization_reason}`);
  if (
    text.includes("missao da pequena mudanca") ||
    text.includes("acao simples e sustentavel") ||
    text.includes("praticar hoje por pelo menos 10 minutos")
  ) {
    errors.push("generic_fallback_mission");
  }
  if (
    text.includes("banho mais longo") ||
    text.includes("use mais agua") ||
    text.includes("use mais energia") ||
    text.includes("jogue fora") ||
    text.includes("comprar mais") ||
    text.includes("compre mais")
  ) {
    errors.push("mission_increases_consumption_without_justification");
  }
  if (classification.issue_type === "health" && text.includes("altere o remedio")) {
    errors.push("health_constraint_literalized");
  }
  for (const blockedAction of classification.blocked_actions) {
    if (blockedActionMentioned(text, blockedAction)) {
      errors.push(`blocked_action_literalized:${blockedAction}`);
    }
  }

  if (classification.issue_type === "unclear") warnings.push("unclear_feedback_conservative_edit");
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

async function classifyWithAi(input: {
  mission: Record<string, unknown>;
  userInput: string;
  deterministicClassification: FeedbackClassificationV1;
  profile: Record<string, unknown>;
}) {
  if (!hasAiKey()) {
    return {
      classification: input.deterministicClassification,
      usedAi: false,
      fallbackReason: "no_ai_key",
    };
  }

  const aiResult = await runJsonAgent({
    role: "adventurer",
    task: `Classifique o feedback de edição da missão como restrição, nunca como objetivo literal.
Retorne apenas este JSON:
{
  "issue_type": "time | cost | access | health | safety | preference | already_doing | too_easy | too_hard | unclear",
  "constraint_strength": "hard | soft | temporary",
  "blocked_actions": ["string"],
  "allowed_adjustments": ["string"],
  "new_fact_candidates": [
    {
      "fact_key": "string",
      "fact_type": "constraint | deficit | capability | preference | interest | habit | context | goal | risk",
      "category": "water | energy | waste | transport | food | consumption | null",
      "value": {},
      "confidence": 0.0
    }
  ],
  "raw_text_summary": "resumo curto sem dados sensiveis",
  "confidence": 0.0
}
Regras:
- Feedback sobre remedio, saude ou seguranca e restricao.
- "Ja faco isso" e capacidade/preferencia por mais novidade, nao recusa total.
- Nao crie hard block de categoria inteira.
- Nao use valores fora do vocabulario acima.`,
    context: {
      mission: {
        id: input.mission.id,
        title: input.mission.title,
        category: input.mission.category,
        pattern_key: input.mission.pattern_key,
        action_fingerprint: input.mission.action_fingerprint,
        difficulty: input.mission.difficulty,
        effort_minutes: input.mission.effort_minutes,
        cost_level: input.mission.cost_level,
      },
      feedback_summary: summarizeFeedback(input.userInput),
      profile_context: {
        socioeconomic_context: input.profile.socioeconomic_context,
      },
    },
    fallback: input.deterministicClassification as unknown as Record<string, unknown>,
  }) as any;

  const fallbackReason = typeof aiResult?._fallback_reason === "string"
    ? aiResult._fallback_reason
    : null;
  const normalized = normalizeFeedbackClassification(
    aiResult,
    input.userInput,
    isCategory(input.mission.category) ? input.mission.category : null,
    typeof input.mission.action_fingerprint === "string" ? input.mission.action_fingerprint : null,
  );

  return {
    classification: normalized,
    usedAi: !fallbackReason,
    fallbackReason,
  };
}

async function composeEditWithAi(input: {
  candidate: EditedMissionCandidate;
  classification: FeedbackClassificationV1;
  originalMission: Record<string, unknown>;
}) {
  if (!hasAiKey()) {
    return {
      candidate: input.candidate,
      usedAi: false,
      fallbackReason: "no_ai_key",
    };
  }

  const aiResult = await runJsonAgent({
    role: "adventurer",
    task: `Reescreva a missão editada em português brasileiro sem alterar campos canonicos.
Retorne apenas:
{
  "title": "string",
  "description": "string",
  "personalization_reason": "string"
}
Regras:
- Preserve objetivo ambiental, categoria, custo, tempo, dificuldade e fatos usados.
- Feedback e restricao, nao objetivo literal.
- Nunca sugira banho mais longo, comprar mais, usar mais agua/energia ou descartar mais.
- Se houver remedio/saude, proteja a etapa de cuidado e reduza apenas onde for seguro.
- Seja concreto e evite frase generica.`,
    context: {
      canonical_candidate: input.candidate,
      classification: input.classification,
      original_mission: {
        title: input.originalMission.title,
        description: input.originalMission.description,
      },
    },
    fallback: {
      title: input.candidate.title,
      description: input.candidate.description,
      personalization_reason: input.candidate.personalization_reason,
    },
  }) as any;

  const fallbackReason = typeof aiResult?._fallback_reason === "string"
    ? aiResult._fallback_reason
    : null;
  if (fallbackReason) {
    return { candidate: input.candidate, usedAi: false, fallbackReason };
  }

  const candidate = {
    ...input.candidate,
    title: typeof aiResult.title === "string" && aiResult.title.trim()
      ? aiResult.title.trim().slice(0, 90)
      : input.candidate.title,
    description: typeof aiResult.description === "string" && aiResult.description.trim()
      ? aiResult.description.trim().slice(0, 700)
      : input.candidate.description,
    personalization_reason: typeof aiResult.personalization_reason === "string" && aiResult.personalization_reason.trim()
      ? aiResult.personalization_reason.trim().slice(0, 420)
      : input.candidate.personalization_reason,
  } satisfies EditedMissionCandidate;

  return { candidate, usedAi: true, fallbackReason: null };
}

async function upsertFeedbackFacts(
  supabaseAdmin: any,
  userId: string,
  classification: FeedbackClassificationV1,
  eventId: string,
  now: string,
) {
  if (!hasUsefulStructuredFeedback(classification)) return 0;

  const factKeys = classification.new_fact_candidates.map((fact) => fact.fact_key);
  const { data: existingFacts, error: existingFactsError } = await supabaseAdmin
    .from("user_profile_facts")
    .select("fact_key, source_event_ids, evidence_count, first_seen_at")
    .eq("user_id", userId)
    .in("fact_key", factKeys);

  if (existingFactsError) {
    throw new Error(`Erro ao buscar fatos existentes da edição: ${existingFactsError.message}`);
  }

  const existingByKey = new Map(
    ((existingFacts ?? []) as Record<string, unknown>[])
      .map((fact) => [String(fact.fact_key), fact] as const),
  );

  const rows = classification.new_fact_candidates.map((fact) => {
    const existing = existingByKey.get(fact.fact_key) ?? {};
    const existingEventIds = Array.isArray(existing.source_event_ids)
      ? existing.source_event_ids.filter((id): id is string => typeof id === "string")
      : [];
    const sourceEventIds = [...new Set([...existingEventIds, eventId])].slice(-30);

    return {
      user_id: userId,
      fact_key: fact.fact_key,
      fact_type: fact.fact_type,
      category: fact.category,
      value: {
        ...fact.value,
        source: "mission_edit_feedback",
        classification: {
          issue_type: classification.issue_type,
          constraint_strength: classification.constraint_strength,
        },
      },
      confidence: fact.confidence,
      source_event_ids: sourceEventIds,
      active: true,
      derived_by: MISSION_EDIT_ALGORITHM_VERSION,
      evidence_count: Math.max(numberValue(existing.evidence_count, 0), existingEventIds.length) + 1,
      first_seen_at: typeof existing.first_seen_at === "string" ? existing.first_seen_at : now,
      last_seen_at: now,
      updated_at: now,
    };
  });

  const { error } = await supabaseAdmin
    .from("user_profile_facts")
    .upsert(rows, { onConflict: "user_id,fact_key" });

  if (error) throw new Error(`Erro ao gravar fatos da edição: ${error.message}`);
  return rows.length;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  try {
    const { userId, missionId, userInput } = await req.json();

    if (!userId || !missionId || !String(userInput ?? "").trim()) {
      throw new Error("Parâmetros 'userId', 'missionId' e 'userInput' são obrigatórios.");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();
    const aiRuntime = aiRuntimeSummary();

    console.log("[MISSION_EDIT] Iniciando edição segura.", {
      userId,
      missionId,
      feedbackLength: String(userInput).length,
    });

    const [
      { data: mission, error: missionError },
      { data: profile, error: profileError },
      { data: rawFacts, error: factsError },
      { data: rawPatterns, error: patternsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("user_missions")
        .select("*")
        .eq("id", missionId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("xp, socioeconomic_context, learned_preferences, affinities")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_profile_facts")
        .select("fact_key, fact_type, category, value, confidence, active")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(500),
      supabaseAdmin
        .from("mission_patterns")
        .select("*")
        .eq("active", true),
    ]);

    if (missionError) throw new Error(`Erro ao buscar missão: ${missionError.message}`);
    if (!mission) throw new Error("Missão ativa não encontrada para edição.");
    if (profileError) throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
    if (!profile) throw new Error("Perfil não encontrado.");
    if (factsError) throw new Error(`Erro ao buscar fatos: ${factsError.message}`);
    if (patternsError) throw new Error(`Erro ao buscar mission_patterns: ${patternsError.message}`);

    const feedbackText = String(userInput);
    const feedbackHash = stableHash(`${userId}:${missionId}:${feedbackText}`);
    const previousFeedbackNotes = asObject(mission.feedback_notes);
    const previousSnapshot = asObject(mission.generation_snapshot);
    const previousFeedbackAt = Date.parse(String(
      previousFeedbackNotes.updated_at ?? previousFeedbackNotes.created_at ?? "",
    ));
    const isRecentDuplicateEdit =
      previousFeedbackNotes.source === "mission_edit" &&
      previousFeedbackNotes.raw_text_hash === feedbackHash &&
      previousFeedbackNotes.validation_status === "valid" &&
      Number.isFinite(previousFeedbackAt) &&
      Date.now() - previousFeedbackAt < 10 * 60 * 1000;

    if (isRecentDuplicateEdit) {
      const lastEdit = asObject(previousSnapshot.last_edit);
      const selected = asObject(lastEdit.selected);
      const classification = asObject(previousFeedbackNotes.classification);

      console.log("[MISSION_EDIT] Edição duplicada recente ignorada.", {
        userId,
        missionId,
        feedbackHash,
        issueType: classification.issue_type ?? null,
      });

      return jsonResponse({
        success: true,
        message: "mission_edit_already_applied",
        mission_id: missionId,
        issue_type: classification.issue_type ?? null,
        fallback_reason: previousFeedbackNotes.fallback_reason ?? null,
        validation_status: previousFeedbackNotes.validation_status ?? null,
        edited_fields: selected,
        idempotent: true,
      });
    }

    const facts = ((rawFacts ?? []) as ProfileFact[]).filter((fact) => fact.active !== false);
    const patterns = ((rawPatterns ?? []) as Record<string, unknown>[])
      .map((pattern) => ({
        ...pattern,
        action_fingerprint: deriveActionFingerprint(pattern),
      }) as PatternRow)
      .filter((pattern) => isCategory(pattern.category));

    if (!patterns.length) {
      throw new Error("Nenhum mission_pattern ativo encontrado para edição segura.");
    }

    const deterministicClassification = normalizeFeedbackClassification(
      {},
      feedbackText,
      isCategory(mission.category) ? mission.category : null,
      typeof mission.action_fingerprint === "string" ? mission.action_fingerprint : null,
    );
    const classificationAttempt = await classifyWithAi({
      mission,
      userInput: feedbackText,
      deterministicClassification,
      profile,
    });
    const classification = classificationAttempt.classification;
    const selectedPattern = selectPatternForEdit({ mission, patterns, classification, profile });

    if (!selectedPattern) throw new Error("Não foi possível selecionar um pattern seguro para edição.");

    const fallbackCandidate = buildEditedCandidate({
      mission,
      pattern: selectedPattern,
      facts,
      classification,
      profile,
    });
    const composed = await composeEditWithAi({
      candidate: fallbackCandidate,
      classification,
      originalMission: mission,
    });
    let finalCandidate = composed.candidate;
    let validation = validateEditedMission(finalCandidate, facts, classification);
    let usedFallback = !composed.usedAi;
    let fallbackReason = composed.fallbackReason;

    if (!validation.valid && composed.usedAi) {
      const fallbackValidation = validateEditedMission(fallbackCandidate, facts, classification);
      if (fallbackValidation.valid) {
        finalCandidate = fallbackCandidate;
        validation = fallbackValidation;
        usedFallback = true;
        fallbackReason = "ai_edit_candidate_invalid_deterministic_fallback";
      }
    }

    if (!validation.valid) {
      console.warn("[MISSION_EDIT] Candidata editada rejeitada.", {
        userId,
        missionId,
        issueType: classification.issue_type,
        errors: validation.errors,
      });
      return jsonResponse({
        error: "edited_mission_invalid",
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
      }, 422);
    }

    const now = new Date().toISOString();
    const editSnapshot = {
      schema_version: MISSION_EDIT_SCHEMA_VERSION,
      algorithm: MISSION_EDIT_ALGORITHM_VERSION,
      edited_at: now,
      feedback_hash: feedbackHash,
      original: {
        pattern_key: mission.pattern_key ?? null,
        action_fingerprint: mission.action_fingerprint ?? null,
        difficulty: mission.difficulty ?? null,
        effort_minutes: mission.effort_minutes ?? null,
        cost_level: mission.cost_level ?? null,
      },
      selected: {
        pattern_key: finalCandidate.pattern_key,
        action_fingerprint: finalCandidate.action_fingerprint,
        difficulty: finalCandidate.difficulty,
        effort_minutes: finalCandidate.effort_minutes,
        cost_level: finalCandidate.cost_level,
      },
      classification: {
        issue_type: classification.issue_type,
        constraint_strength: classification.constraint_strength,
        allowed_adjustments: classification.allowed_adjustments,
        blocked_actions: classification.blocked_actions,
        confidence: classification.confidence,
      },
      ai: {
        ...aiRuntime,
        classification_ai_used: classificationAttempt.usedAi,
        classification_fallback_reason: classificationAttempt.fallbackReason,
        composer_ai_used: composed.usedAi,
        composer_fallback_reason: composed.fallbackReason,
        used_fallback: usedFallback,
        fallback_reason: fallbackReason,
      },
      validation: {
        status: "valid",
        warnings: validation.warnings,
      },
    };
    const generationSnapshot = {
      ...previousSnapshot,
      last_edit: editSnapshot,
      edit_history_count: numberValue(previousSnapshot.edit_history_count, 0) + 1,
    };
    const feedbackNotes = {
      source: "mission_edit",
      raw_text_summary: classification.raw_text_summary,
      raw_text_hash: feedbackHash,
      raw_text_length: feedbackText.length,
      classification,
      created_at: now,
      updated_at: now,
      ai_used: classificationAttempt.usedAi || composed.usedAi,
      fallback_reason: fallbackReason ?? classificationAttempt.fallbackReason ?? null,
      validation_status: "valid",
    };

    const updatedJustification = {
      ...asObject(mission.ai_justification),
      category: finalCandidate.category,
      reason: finalCandidate.personalization_reason,
      mission_type: finalCandidate.mission_type,
      edited_by: MISSION_EDIT_ALGORITHM_VERSION,
      issue_type: classification.issue_type,
      profile_written_by_ai: false,
    };

    const { error: updateError } = await supabaseAdmin
      .from("user_missions")
      .update({
        title: finalCandidate.title,
        description: finalCandidate.description,
        ai_justification: updatedJustification,
        feedback_notes: feedbackNotes,
        category: finalCandidate.category,
        environmental_goal: finalCandidate.environmental_goal,
        difficulty: finalCandidate.difficulty,
        effort_minutes: finalCandidate.effort_minutes,
        cost_level: finalCandidate.cost_level,
        xp_reward: finalCandidate.xp_reward,
        used_fact_keys: finalCandidate.used_fact_keys,
        personalization_reason: finalCandidate.personalization_reason,
        generation_snapshot: generationSnapshot,
        expected_impact: finalCandidate.expected_impact,
        pattern_key: finalCandidate.pattern_key,
        action_fingerprint: finalCandidate.action_fingerprint,
      })
      .eq("id", missionId)
      .eq("user_id", userId)
      .eq("status", "active");

    if (updateError) throw new Error(`Erro ao atualizar missão: ${updateError.message}`);

    const eventId = crypto.randomUUID();
    const { error: eventError } = await supabaseAdmin
      .from("user_profile_events")
      .insert({
        id: eventId,
        user_id: userId,
        event_type: "FEEDBACK_SENT",
        source: "mission_edit",
        source_table: "user_missions",
        source_id: missionId,
        payload: {
          mission_id: missionId,
          feedback_hash: feedbackHash,
          feedback_length: feedbackText.length,
          feedback_summary: classification.raw_text_summary,
          classification,
          creates_structured_fact: hasUsefulStructuredFeedback(classification),
          edited_fields: {
            pattern_key: finalCandidate.pattern_key,
            action_fingerprint: finalCandidate.action_fingerprint,
            difficulty: finalCandidate.difficulty,
            effort_minutes: finalCandidate.effort_minutes,
            cost_level: finalCandidate.cost_level,
          },
        },
        metadata: {
          schema_version: MISSION_EDIT_SCHEMA_VERSION,
          algorithm: MISSION_EDIT_ALGORITHM_VERSION,
          ai_used: classificationAttempt.usedAi || composed.usedAi,
          profile_written_by_ai: false,
        },
        schema_version: MISSION_EDIT_SCHEMA_VERSION,
        occurred_at: now,
      });

    if (eventError) throw new Error(`Erro ao registrar evento de feedback: ${eventError.message}`);

    const factsWritten = await upsertFeedbackFacts(supabaseAdmin, userId, classification, eventId, now);
    const achievements = await unlockEligibleAchievements(supabaseAdmin, userId, "edit-mission");

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "adventurer",
      eventType: "EDIT_MISSION",
      inputSummary: {
        missionId,
        feedbackLength: feedbackText.length,
        issueType: classification.issue_type,
      },
      output: {
        mission_id: missionId,
        pattern_key: finalCandidate.pattern_key,
        action_fingerprint: finalCandidate.action_fingerprint,
        issue_type: classification.issue_type,
        facts_written: factsWritten,
        achievements_unlocked: achievements.unlocked.length,
        ai_used: classificationAttempt.usedAi || composed.usedAi,
        fallback_reason: fallbackReason ?? classificationAttempt.fallbackReason ?? null,
      },
    });

    console.log("[MISSION_EDIT] Edição segura concluída.", {
      userId,
      missionId,
      issueType: classification.issue_type,
      patternKey: finalCandidate.pattern_key,
      actionFingerprint: finalCandidate.action_fingerprint,
      classificationAiUsed: classificationAttempt.usedAi,
      composerAiUsed: composed.usedAi,
      fallbackReason: fallbackReason ?? classificationAttempt.fallbackReason ?? null,
      validationStatus: "valid",
      factsWritten,
      achievementsUnlocked: achievements.unlocked.length,
      elapsedMs: Date.now() - new Date(startedAt).getTime(),
    });

    return jsonResponse({
      success: true,
      message: "mission_edited",
      issue_type: classification.issue_type,
      pattern_key: finalCandidate.pattern_key,
      action_fingerprint: finalCandidate.action_fingerprint,
      ai_used: classificationAttempt.usedAi || composed.usedAi,
      fallback_reason: fallbackReason ?? classificationAttempt.fallbackReason ?? null,
      facts_written: factsWritten,
      achievements,
    });
  } catch (error: any) {
    console.error("[MISSION_EDIT] Erro crítico:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
