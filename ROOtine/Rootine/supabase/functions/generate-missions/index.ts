import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { allowedCategories, logAgentInteraction, runJsonAgent } from "../_shared/agents.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";

const CONTEXT_VERSION = "MissionGenerationContextV1";
const ALGORITHM_VERSION = "hybrid_ai_mission_composer_v2";
const RECENT_DAYS = 14;
const MAX_ACTIVE_MISSIONS = 4;
const MAX_AI_BLUEPRINTS = 6;
const MAX_AI_CANDIDATES = 3;

const COST_ORDER = ["free", "low", "medium", "high"] as const;
const XP_REWARD_BY_DIFFICULTY: Record<number, number> = {
  1: 10,
  2: 16,
  3: 25,
  4: 40,
  5: 60,
};

type MissionType = "daily" | "specialized";
type Category = typeof allowedCategories[number];

interface PatternRow {
  key: string;
  action_fingerprint: string;
  category: Category;
  environmental_goal: string;
  difficulty_min: number;
  difficulty_max: number;
  cost_level: string;
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
  last_seen_at?: string | null;
}

interface MissionCandidate {
  title: string;
  description: string;
  category: Category;
  environmental_goal: string;
  difficulty: number;
  effort_minutes: number;
  cost_level: string;
  used_fact_keys: string[];
  personalization_reason: string;
  expected_impact: Record<string, unknown>;
  pattern_key: string;
  action_fingerprint: string;
  mission_type: MissionType;
  xp_reward: number;
  ai_justification: Record<string, unknown>;
}

interface RankedPattern {
  pattern: PatternRow;
  score: number;
  usedFacts: ProfileFact[];
  rejectedReasons: string[];
}

function isMissionType(value: unknown): value is MissionType {
  return value === "daily" || value === "specialized";
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && allowedCategories.includes(value as Category);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
    : [];
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function costRank(value: string) {
  const index = COST_ORDER.indexOf(value as any);
  return index >= 0 ? index : COST_ORDER.length - 1;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLevelFromXp(rawXp: unknown) {
  const xp = Math.max(0, Math.floor(numberValue(rawXp, 0)));
  const thresholds = [0, 10, 45, 100, 180, 300, 470, 700, 1000, 1400, 1900, 2500, 3200];
  let level = 0;
  while (thresholds[level + 1] !== undefined && thresholds[level + 1] <= xp) level += 1;
  return level;
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

function missionWindowDays(missionType: MissionType) {
  return missionType === "specialized" ? 7 : 1;
}

function normalizeClientRequestId(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^a-zA-Z0-9:._-]/g, "")
    .slice(0, 120)
    .trim();
  return cleaned.length >= 12 ? cleaned : null;
}

async function findMissionByGenerationRequest(
  supabaseAdmin: any,
  userId: string,
  generationRequestId: string | null,
) {
  if (!generationRequestId) return null;

  const { data, error } = await supabaseAdmin
    .from("user_missions")
    .select("id, status, mission_type, category, pattern_key, action_fingerprint")
    .eq("user_id", userId)
    .eq("generation_request_id", generationRequestId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar geração idempotente: ${error.message}`);
  }

  return data ?? null;
}

function maxCostFromProfile(profile: Record<string, unknown>) {
  const context = asObject(profile.socioeconomic_context);
  const friction = String(context.financial_friction ?? "");
  if (friction === "high") return "free";
  if (friction === "medium") return "low";
  return "medium";
}

function maxDifficultyFromProfile(
  profile: Record<string, unknown>,
  missionType: MissionType,
  facts: ProfileFact[],
) {
  const level = getLevelFromXp(profile.xp);
  const context = asObject(profile.socioeconomic_context);
  const sustainability = asObject(context.sustainability);
  const experience = String(sustainability.experience ?? "");
  const timeBudget = timeBudgetFromProfile(profile, missionType);
  const finance = String(context.financial_friction ?? "");
  const hasManyPositiveFacts = facts.filter((fact) =>
    ["habit", "capability", "interest", "preference", "goal"].includes(fact.fact_type)
  ).length >= 8;

  let maxDifficulty = 2;
  if (level >= 3 || experience === "some_habits" || hasManyPositiveFacts) maxDifficulty = 3;
  if (level >= 6 || experience === "consistent") maxDifficulty = 4;
  if (level >= 9 && missionType === "specialized") maxDifficulty = 5;

  if (missionType === "specialized") maxDifficulty += 1;
  if (timeBudget <= 5 || finance === "high") maxDifficulty = Math.min(maxDifficulty, 2);

  return clamp(maxDifficulty, 1, 5);
}

function factLabel(fact: ProfileFact) {
  const value = asObject(fact.value);
  if (typeof value.label === "string") return value.label;
  if (typeof value.signal_key === "string") return value.signal_key;
  return fact.fact_key;
}

function missionTextSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length > 3));
  const rightTokens = new Set(normalizeText(right).split(" ").filter((token) => token.length > 3));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function rankPattern(input: {
  pattern: PatternRow;
  profile: Record<string, unknown>;
  facts: ProfileFact[];
  recentMissions: any[];
  recentCategoryCounts: Record<string, number>;
  activeCategoryCounts: Record<string, number>;
  recentPatternKeys: Set<string>;
  recentActionFingerprints: Set<string>;
  missionType: MissionType;
  maxDifficulty: number;
  maxCost: string;
  timeBudget: number;
}) {
  const {
    pattern,
    profile,
    facts,
    recentMissions,
    recentCategoryCounts,
    activeCategoryCounts,
    recentPatternKeys,
    recentActionFingerprints,
    missionType,
    maxDifficulty,
    maxCost,
    timeBudget,
  } = input;
  const rejectedReasons: string[] = [];

  if (pattern.difficulty_min > maxDifficulty) rejectedReasons.push("difficulty_above_profile");
  if (pattern.effort_minutes_min > timeBudget) rejectedReasons.push("effort_above_profile");
  if (costRank(pattern.cost_level) > costRank(maxCost)) rejectedReasons.push("cost_above_profile");
  if (!pattern.recurrence_allowed && recentPatternKeys.has(pattern.key)) {
    rejectedReasons.push("pattern_repeated_recently");
  }
  if (!pattern.recurrence_allowed && recentActionFingerprints.has(pattern.action_fingerprint)) {
    rejectedReasons.push("action_fingerprint_repeated_recently");
  }

  const activeFactKeys = new Set(facts.map((fact) => fact.fact_key));
  const disqualified = pattern.disqualifying_fact_keys.some((factKey) => activeFactKeys.has(factKey));
  if (disqualified) rejectedReasons.push("disqualifying_fact_present");

  const matchingFacts = facts
    .filter((fact) =>
      (fact.category === pattern.category || fact.category === null) &&
      pattern.required_or_helpful_fact_types.includes(fact.fact_type)
    )
    .sort((left, right) => {
      const leftCategoryBoost = left.category === pattern.category ? 1 : 0;
      const rightCategoryBoost = right.category === pattern.category ? 1 : 0;
      if (leftCategoryBoost !== rightCategoryBoost) return rightCategoryBoost - leftCategoryBoost;
      return numberValue(right.confidence, 0) - numberValue(left.confidence, 0);
    });

  let score = 0;
  score += matchingFacts.length > 0 ? 18 : -12;
  score += matchingFacts.filter((fact) => fact.fact_type === "deficit").length * 5;
  score += matchingFacts.filter((fact) => fact.fact_type === "capability").length * 3;
  score += matchingFacts.filter((fact) => fact.fact_type === "preference" || fact.fact_type === "goal").length * 2;

  const affinities = asObject(profile.affinities);
  score += numberValue(affinities[pattern.category], 0) * 5;

  const categoryRepeatCount = recentCategoryCounts[pattern.category] ?? 0;
  score += Math.max(0, 6 - categoryRepeatCount * 2);

  const activeCategoryCount = activeCategoryCounts[pattern.category] ?? 0;
  if (activeCategoryCount > 0) {
    score -= activeCategoryCount === 1
      ? 18
      : activeCategoryCount === 2
        ? 50
        : 95 + (activeCategoryCount - 3) * 35;
  }

  const difficultyTarget = missionType === "specialized"
    ? Math.max(2, Math.min(maxDifficulty, 4))
    : Math.max(1, Math.min(maxDifficulty, 3));
  score -= Math.abs(pattern.difficulty_min - difficultyTarget) * 2;

  if (pattern.cost_level === "free") score += 2;
  if (pattern.effort_minutes_max <= timeBudget) score += 2;

  const fallbackText = `${pattern.fallback_title_pt} ${pattern.fallback_description_pt}`;
  const similarRecent = recentMissions.some((mission) =>
    missionTextSimilarity(fallbackText, `${mission.title ?? ""} ${mission.description ?? ""}`) >= 0.72
  );
  if (similarRecent) rejectedReasons.push("mission_semantically_repeated_recently");

  return {
    pattern,
    score,
    usedFacts: matchingFacts.slice(0, 4),
    rejectedReasons,
  } satisfies RankedPattern;
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
    impact.co2_kg = { low: 0.02 * factor, mid: 0.18 * factor, high: 0.55 * factor, confidence: 0.28 };
  }

  return impact;
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

  return typeof pattern.key === "string" && pattern.key.trim()
    ? pattern.key.trim()
    : "unknown.action";
}

function hasPositiveImpact(impact: Record<string, any>) {
  return Object.values(impact).some((range: any) =>
    Number(range?.mid ?? 0) > 0 || Number(range?.high ?? 0) > 0
  );
}

function validateCandidate(
  candidate: MissionCandidate,
  options: {
    facts: ProfileFact[];
    recentMissions: any[];
    recentPatternKeys: Set<string>;
    recentActionFingerprints: Set<string>;
    userLevel: number;
  },
) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!candidate.title || candidate.title.trim().length < 4) errors.push("title_required");
  if (!candidate.description || candidate.description.trim().length < 20) errors.push("description_required");
  if (!isCategory(candidate.category)) errors.push("category_invalid");
  if (!COST_ORDER.includes(candidate.cost_level as any)) errors.push("cost_level_invalid");
  if (!Number.isInteger(candidate.difficulty) || candidate.difficulty < 1 || candidate.difficulty > 5) {
    errors.push("difficulty_invalid");
  }
  if (!Number.isFinite(candidate.effort_minutes) || candidate.effort_minutes < 0 || candidate.effort_minutes > 240) {
    errors.push("effort_minutes_invalid");
  }
  if (!candidate.environmental_goal || !normalizeText(candidate.environmental_goal).match(/reduzir|evitar|economizar|reutilizar|reciclar|separar|consertar|diminuir|desperdicio|emissao|agua|energia|consumo/)) {
    errors.push("environmental_goal_not_positive_or_explicit");
  }
  if (!candidate.used_fact_keys.length) errors.push("used_fact_keys_required");
  if (!candidate.personalization_reason || candidate.personalization_reason.trim().length < 20) {
    errors.push("personalization_reason_required");
  }
  if (!hasPositiveImpact(candidate.expected_impact as any)) {
    errors.push("expected_impact_must_have_positive_metric");
  }

  const activeFactKeys = new Set(options.facts.map((fact) => fact.fact_key));
  for (const factKey of candidate.used_fact_keys) {
    if (!factKey.startsWith("cold_start.") && !activeFactKeys.has(factKey)) {
      errors.push(`used_fact_key_not_found:${factKey}`);
    }
  }

  const text = normalizeText(`${candidate.title} ${candidate.description} ${candidate.personalization_reason}`);
  if (
    text.includes("missao da pequena mudanca") ||
    text.includes("escolha uma acao simples") ||
    text.includes("praticar hoje por pelo menos 10 minutos")
  ) {
    errors.push("generic_fallback_mission");
  }

  if (
    text.includes("registre mentalmente o que funcionou") ||
    text.includes("reserve em cerca de") ||
    text.includes("nao compre nada para concluir") ||
    text.includes("distribua ou repita a acao")
  ) {
    errors.push("mission_contains_boilerplate_suffix");
  }

  const harmful = [
    "compre mais",
    "comprar mais",
    "use mais agua",
    "use mais energia",
    "deixe ligado",
    "jogue fora",
    "banho mais longo",
  ];
  if (harmful.some((term) => text.includes(term))) {
    errors.push("mission_increases_consumption_without_justification");
  }

  if (options.recentPatternKeys.has(candidate.pattern_key)) {
    errors.push("pattern_repeated_recently");
  }
  if (!candidate.action_fingerprint || candidate.action_fingerprint.trim().length < 3) {
    errors.push("action_fingerprint_required");
  }
  if (options.recentActionFingerprints.has(candidate.action_fingerprint)) {
    errors.push("action_fingerprint_repeated_recently");
  }

  const missionText = `${candidate.title} ${candidate.description}`;
  if (
    options.recentMissions.some((mission) =>
      missionTextSimilarity(missionText, `${mission.title ?? ""} ${mission.description ?? ""}`) >= 0.72
    )
  ) {
    errors.push("mission_semantically_repeated_recently");
  }

  if (options.userLevel >= 7 && candidate.difficulty <= 1 && candidate.effort_minutes <= 5) {
    errors.push("mission_too_trivial_for_experienced_user");
  }

  if (candidate.used_fact_keys.some((factKey) => factKey.startsWith("cold_start."))) {
    warnings.push("cold_start_fact_used");
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function buildFallbackCandidate(
  pattern: PatternRow,
  facts: ProfileFact[],
  profile: Record<string, unknown>,
  missionType: MissionType,
) {
  const timeBudget = timeBudgetFromProfile(profile, missionType);
  const difficulty = clamp(pattern.difficulty_min, 1, pattern.difficulty_max);
  const effortMinutes = clamp(
    Math.min(pattern.effort_minutes_max, Math.max(pattern.effort_minutes_min, Math.round(timeBudget * 0.7))),
    pattern.effort_minutes_min,
    pattern.effort_minutes_max,
  );
  const usedFacts = facts.length
    ? facts
    : [{
      fact_key: "cold_start.prompt7.context_available",
      fact_type: "context",
      category: pattern.category,
      value: { source: "fallback_context" },
      confidence: 0.45,
    } as ProfileFact];
  const strongestFact = usedFacts[0];
  const factSummary = factLabel(strongestFact);
  const expectedImpact = impactEstimate(pattern, difficulty);
  const xpReward = XP_REWARD_BY_DIFFICULTY[difficulty] ?? 10;

  return {
    title: pattern.fallback_title_pt,
    description: descriptionForMissionType(pattern, missionType),
    category: pattern.category,
    environmental_goal: pattern.environmental_goal,
    difficulty,
    effort_minutes: effortMinutes,
    cost_level: pattern.cost_level,
    used_fact_keys: usedFacts.map((fact) => fact.fact_key).slice(0, 4),
    personalization_reason:
      `${pattern.fallback_reason_pt} Usei como base o fato "${factSummary}" e respeitei tempo, custo e autonomia do perfil.`,
    expected_impact: expectedImpact,
    pattern_key: pattern.key,
    action_fingerprint: pattern.action_fingerprint,
    mission_type: missionType,
    xp_reward: xpReward,
    ai_justification: {
      category: pattern.category,
      reason:
        `${pattern.fallback_reason_pt} A missão veio de um pattern validado e usa fatos reais do perfil.`,
      mission_type: missionType,
      generated_by: ALGORITHM_VERSION,
    },
  } satisfies MissionCandidate;
}

async function ensureColdStartFact(supabaseAdmin: any, userId: string, category: Category) {
  const now = new Date().toISOString();
  const fact = {
    user_id: userId,
    fact_key: "cold_start.prompt7.context_available",
    fact_type: "context",
    category,
    value: {
      source: "generate_missions",
      reason: "Perfil sem fatos ativos suficientes; fato frio criado explicitamente para permitir missão inicial auditável.",
      algorithm: ALGORITHM_VERSION,
    },
    confidence: 0.45,
    source_event_ids: [],
    active: true,
    derived_by: ALGORITHM_VERSION,
    evidence_count: 1,
    last_seen_at: now,
    updated_at: now,
  };

  const { error } = await supabaseAdmin
    .from("user_profile_facts")
    .upsert(fact, { onConflict: "user_id,fact_key" });

  if (error) throw new Error(`Erro ao criar fato cold start: ${error.message}`);
  return fact as ProfileFact;
}

interface MissionBlueprint {
  rankedPattern: RankedPattern;
  fallbackCandidate: MissionCandidate;
}

interface AiCompositionAttempt {
  candidate: MissionCandidate;
  source: "ai" | "fallback";
  fallbackReason: string | null;
}

function sanitizeAiText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const trimmed = stripGenericMissionBoilerplate(value).replace(/\s+/g, " ").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function stripGenericMissionBoilerplate(value: string) {
  return value
    .replace(/\s*Faça em um momento seguro da rotina e registre mentalmente o que funcionou\./gi, "")
    .replace(/\s*Reserve em poucos minutos e não compre nada para concluir\./gi, "")
    .replace(/\s*Reserve em cerca de \d+ minutos e não compre nada para concluir\./gi, "")
    .replace(/\s*Reserve em até \d+ minutos, sem pressa e não compre nada para concluir\./gi, "")
    .replace(/\s*Reserve ao longo de até \d+ minutos e não compre nada para concluir\./gi, "")
    .replace(/\s*Distribua ou repita a ação ao longo de até 7 dias, acompanhando o que funcionou\./gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionForMissionType(pattern: PatternRow, missionType: MissionType) {
  const cleanDescription = stripGenericMissionBoilerplate(pattern.fallback_description_pt);
  if (missionType === "specialized" && cleanDescription.startsWith("Hoje, ")) {
    return `Nesta semana, ${cleanDescription.slice("Hoje, ".length)}`;
  }
  return cleanDescription;
}

function buildAiCandidateFromBlueprint(
  rawCandidate: Record<string, unknown>,
  blueprintByPatternKey: Map<string, MissionBlueprint>,
  candidateIndex: number,
) {
  const patternKey = typeof rawCandidate.pattern_key === "string"
    ? rawCandidate.pattern_key
    : "";
  const blueprint = blueprintByPatternKey.get(patternKey);
  if (!blueprint) return null;

  const baseCandidate = blueprint.fallbackCandidate;
  const allowedFactKeys = new Set(baseCandidate.used_fact_keys);
  const aiFactKeys = stringArray(rawCandidate.used_fact_keys)
    .filter((factKey) => allowedFactKeys.has(factKey));
  const usedFactKeys = aiFactKeys.length ? aiFactKeys : baseCandidate.used_fact_keys;

  return {
    ...baseCandidate,
    title: sanitizeAiText(rawCandidate.title, baseCandidate.title, 90),
    description: sanitizeAiText(rawCandidate.description, baseCandidate.description, 520),
    used_fact_keys: usedFactKeys,
    personalization_reason: sanitizeAiText(
      rawCandidate.personalization_reason,
      baseCandidate.personalization_reason,
      360,
    ),
    ai_justification: {
      ...baseCandidate.ai_justification,
      reason: sanitizeAiText(
        rawCandidate.personalization_reason,
        baseCandidate.personalization_reason,
        360,
      ),
      composed_by_ai: true,
      composer_candidate_index: candidateIndex,
    },
  } satisfies MissionCandidate;
}

async function composeMissionCandidatesWithAi(
  blueprints: MissionBlueprint[],
  contextSummary: Record<string, unknown>,
) {
  const hasAiKey = Boolean(
    Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPEN_AI_KEY") ?? Deno.env.get("GROQ_API_KEY"),
  );

  if (!hasAiKey) {
    return {
      candidates: [] as MissionCandidate[],
      usedAi: false,
      fallbackReason: "no_ai_key",
    };
  }

  const blueprintByPatternKey = new Map(
    blueprints.map((blueprint) => [blueprint.fallbackCandidate.pattern_key, blueprint]),
  );
  const safeBlueprints = blueprints.map(({ rankedPattern, fallbackCandidate }) => ({
    pattern_key: fallbackCandidate.pattern_key,
    action_fingerprint: fallbackCandidate.action_fingerprint,
    category: fallbackCandidate.category,
    environmental_goal: fallbackCandidate.environmental_goal,
    difficulty: fallbackCandidate.difficulty,
    effort_minutes: fallbackCandidate.effort_minutes,
    cost_level: fallbackCandidate.cost_level,
    xp_reward: fallbackCandidate.xp_reward,
    mission_type: fallbackCandidate.mission_type,
    mission_window_days: missionWindowDays(fallbackCandidate.mission_type),
    used_fact_keys: fallbackCandidate.used_fact_keys,
    personalization_slots: rankedPattern.pattern.personalization_slots,
    fallback_title_pt: rankedPattern.pattern.fallback_title_pt,
    fallback_description_pt: rankedPattern.pattern.fallback_description_pt,
    fallback_reason_pt: rankedPattern.pattern.fallback_reason_pt,
    score: Math.round(rankedPattern.score * 100) / 100,
  }));

  const aiResult = await runJsonAgent({
    role: "adventurer",
    task: `Componha 2 a ${MAX_AI_CANDIDATES} candidatas de missão em português brasileiro usando APENAS os blueprints seguros.
Regras:
- Cada candidata deve escolher um pattern_key recebido nos blueprints.
- Pode variar título, momento da rotina, objeto concreto e abordagem dentro dos slots do blueprint.
- Não altere categoria, action_fingerprint, objetivo ambiental, dificuldade, custo, tempo, XP, impacto ou facts fora dos recebidos.
- Use somente used_fact_keys presentes no blueprint escolhido.
- A descrição deve ser concreta, sustentável, segura, curta e não genérica.
- Se o blueprint tiver mission_window_days = 7, escreva como missão semanal: algo para distribuir, repetir ou acompanhar ao longo da semana.
- Não copie nem acrescente rodapés genéricos como "registre mentalmente o que funcionou", "não compre nada para concluir" ou "Distribua ou repita a ação".
- Evite frases robóticas como "certifique-se de completar em até X minutos".
- Evite justificativas genéricas como "seu nível de usuário"; cite limites, preferências ou fatos concretos do contexto.
- Não invente restrições, dados médicos, custos, acesso doméstico ou fatos novos.
- Não mande comprar nada caro nem aumentar consumo de água, energia, descarte ou emissões.
JSON esperado:
{
  "candidates": [
    {
      "pattern_key": "string",
      "title": "string",
      "description": "string",
      "used_fact_keys": ["string"],
      "personalization_reason": "string"
    }
  ]
}`,
    context: {
      blueprints: safeBlueprints,
      context_summary: contextSummary,
    },
    fallback: {
      candidates: [],
    },
  }) as any;

  const fallbackReason = typeof aiResult?._fallback_reason === "string"
    ? aiResult._fallback_reason
    : null;

  if (fallbackReason) {
    return { candidates: [] as MissionCandidate[], usedAi: false, fallbackReason };
  }

  const rawCandidates = Array.isArray(aiResult?.candidates)
    ? aiResult.candidates.slice(0, MAX_AI_CANDIDATES)
    : [];
  const candidates = rawCandidates
    .map((rawCandidate: unknown, index: number) =>
      buildAiCandidateFromBlueprint(asObject(rawCandidate), blueprintByPatternKey, index)
    )
    .filter((candidate: MissionCandidate | null): candidate is MissionCandidate => Boolean(candidate));

  if (!candidates.length) {
    return { candidates: [] as MissionCandidate[], usedAi: false, fallbackReason: "ai_returned_no_valid_blueprint_candidate" };
  }

  return { candidates, usedAi: true, fallbackReason: null };
}

function aiRuntimeSummary() {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPEN_AI_KEY");

  if (groqKey) {
    return {
      ai_available: true,
      ai_provider: "groq",
      ai_model: Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
    };
  }

  if (openAiKey) {
    return {
      ai_available: true,
      ai_provider: "openai",
      ai_model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
    };
  }

  return {
    ai_available: false,
    ai_provider: null,
    ai_model: null,
  };
}

async function writeGenerationLog(
  supabaseAdmin: any,
  input: {
    userId: string;
    missionId?: string | null;
    missionType: MissionType;
    candidatePatternKeys: string[];
    selectedPatternKey?: string | null;
    selectedActionFingerprint?: string | null;
    rejectedCandidates: unknown[];
    validationErrors: unknown[];
    generationSnapshot: Record<string, unknown>;
    usedFallback: boolean;
    status: "success" | "error" | "rejected" | "fallback";
    errorMessage?: string | null;
  },
) {
  const { error } = await supabaseAdmin
    .from("mission_generation_logs")
    .insert({
      user_id: input.userId,
      mission_id: input.missionId ?? null,
      mission_type: input.missionType,
      context_version: CONTEXT_VERSION,
      candidate_pattern_keys: input.candidatePatternKeys,
      selected_pattern_key: input.selectedPatternKey ?? null,
      selected_action_fingerprint: input.selectedActionFingerprint ?? null,
      rejected_candidates: input.rejectedCandidates,
      validation_errors: input.validationErrors,
      generation_snapshot: input.generationSnapshot,
      used_fallback: input.usedFallback,
      status: input.status,
      error_message: input.errorMessage ?? null,
    });

  if (error) {
    console.error("[MISSION_GEN] Erro ao gravar log de geração:", error.message);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  try {
    const body = await req.json();
    const userId = body.userId;
    const missionType: MissionType = isMissionType(body.missionType) ? body.missionType : "daily";
    const generationRequestId = normalizeClientRequestId(body.clientRequestId ?? body.generationRequestId);

    if (!userId) {
      throw new Error("O parâmetro 'userId' é obrigatório no corpo da requisição.");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();

    console.log("[MISSION_GEN] Iniciando Trilha hiperpersonalizada.", { userId, missionType });

    const existingMissionForRequest = await findMissionByGenerationRequest(
      supabaseAdmin,
      userId,
      generationRequestId,
    );

    if (existingMissionForRequest) {
      console.log("[MISSION_GEN] Requisição idempotente já atendida.", {
        userId,
        missionType,
        generationRequestId,
        missionId: existingMissionForRequest.id,
      });

      return jsonResponse({
        success: true,
        mission_id: existingMissionForRequest.id,
        pattern_key: existingMissionForRequest.pattern_key ?? null,
        action_fingerprint: existingMissionForRequest.action_fingerprint ?? null,
        category: existingMissionForRequest.category ?? null,
        mission_status: existingMissionForRequest.status,
        mission_type: existingMissionForRequest.mission_type ?? missionType,
        client_request_id: generationRequestId,
        idempotent: true,
        message: "mission_already_created",
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("socioeconomic_context, xp, learned_preferences, affinities, onboarding_completed, daily_flashcards_completed")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
    if (!profile) throw new Error("Perfil não encontrado.");

    if (!profile.onboarding_completed) {
      return jsonResponse({ error: "onboarding_pending" }, 400);
    }

    const { data: activeMissions, error: activeError } = await supabaseAdmin
      .from("user_missions")
      .select("id, category, pattern_key, action_fingerprint, title, description, created_at")
      .eq("user_id", userId)
      .eq("status", "active");

    if (activeError) throw new Error(`Erro ao contar missões ativas: ${activeError.message}`);
    const activeMissionCount = activeMissions?.length ?? 0;

    if (activeMissionCount >= MAX_ACTIVE_MISSIONS) {
      return jsonResponse({ success: true, message: "max_missions_reached" });
    }

    const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [
      { data: rawFacts, error: factsError },
      { data: recentMissions, error: recentError },
      { data: patterns, error: patternsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("user_profile_facts")
        .select("fact_key, fact_type, category, value, confidence, active, last_seen_at")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(500),
      supabaseAdmin
        .from("user_missions")
        .select("id, title, description, status, category, pattern_key, action_fingerprint, created_at")
        .eq("user_id", userId)
        .gte("created_at", recentSince)
        .order("created_at", { ascending: false })
        .limit(40),
      supabaseAdmin
        .from("mission_patterns")
        .select("*")
        .eq("active", true),
    ]);

    if (factsError) throw new Error(`Erro ao buscar fatos: ${factsError.message}`);
    if (recentError) throw new Error(`Erro ao buscar histórico de missões: ${recentError.message}`);
    if (patternsError) throw new Error(`Erro ao buscar mission_patterns: ${patternsError.message}`);

    let facts = ((rawFacts ?? []) as ProfileFact[])
      .filter((fact) => fact.active !== false);
    const typedPatterns = ((patterns ?? []) as Record<string, unknown>[])
      .map((pattern) => ({
        ...pattern,
        action_fingerprint: deriveActionFingerprint(pattern),
      }) as PatternRow)
      .filter((pattern) => isCategory(pattern.category));

    if (!typedPatterns.length) {
      throw new Error("Nenhum mission_pattern ativo encontrado. Aplique os seeds do Prompt 7 em add.sql.");
    }

    if (!facts.length) {
      facts = [await ensureColdStartFact(supabaseAdmin, userId, "consumption")];
    }

    const maxDifficulty = maxDifficultyFromProfile(profile, missionType, facts);
    const maxCost = maxCostFromProfile(profile);
    const timeBudget = timeBudgetFromProfile(profile, missionType);
    const userLevel = getLevelFromXp(profile.xp);
    const recentPatternKeys = new Set(
      (recentMissions ?? [])
        .map((mission: any) => mission.pattern_key)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );
    const recentActionFingerprints = new Set(
      (recentMissions ?? [])
        .map((mission: any) => mission.action_fingerprint)
        .filter((key: unknown): key is string => typeof key === "string" && key.length > 0),
    );
    const recentCategoryCounts = (recentMissions ?? []).reduce((acc: Record<string, number>, mission: any) => {
      if (typeof mission.category === "string") {
        acc[mission.category] = (acc[mission.category] ?? 0) + 1;
      }
      return acc;
    }, {});
    const activeCategoryCounts = (activeMissions ?? []).reduce((acc: Record<string, number>, mission: any) => {
      if (typeof mission.category === "string") {
        acc[mission.category] = (acc[mission.category] ?? 0) + 1;
      }
      return acc;
    }, {});

    const ranked = typedPatterns
      .map((pattern) =>
        rankPattern({
          pattern,
          profile,
          facts,
          recentMissions: recentMissions ?? [],
          recentCategoryCounts,
          activeCategoryCounts,
          recentPatternKeys,
          recentActionFingerprints,
          missionType,
          maxDifficulty,
          maxCost,
          timeBudget,
        })
      )
      .sort((left, right) => right.score - left.score);

    const candidatePatternKeys = ranked.slice(0, 12).map((item) => item.pattern.key);
    const rejectedCandidates: unknown[] = ranked
      .filter((item) => item.rejectedReasons.length > 0)
      .slice(0, 20)
      .map((item) => ({
        pattern_key: item.pattern.key,
        action_fingerprint: item.pattern.action_fingerprint,
        reasons: item.rejectedReasons,
        score: Math.round(item.score * 100) / 100,
      }));

    const generationSnapshot = {
      context_version: CONTEXT_VERSION,
      algorithm: ALGORITHM_VERSION,
      requested_at: startedAt,
      client_request_id: generationRequestId,
      active_mission_count: activeMissionCount,
      profile: {
        user_level: userLevel,
        xp: profile.xp,
        max_difficulty: maxDifficulty,
        max_cost: maxCost,
        time_budget_minutes: timeBudget,
        daily_flashcards_completed: Boolean(profile.daily_flashcards_completed),
      },
      facts: {
        count: facts.length,
        fact_keys: facts.slice(0, 40).map((fact) => fact.fact_key),
      },
      recent_history: {
        recent_pattern_keys: [...recentPatternKeys],
        recent_action_fingerprints: [...recentActionFingerprints],
        recent_categories: recentCategoryCounts,
        active_categories: activeCategoryCounts,
      },
    };

    const validationErrors: unknown[] = [];
    let finalCandidate: MissionCandidate | null = null;
    let selectedPattern: PatternRow | null = null;
    let usedFallback = true;
    let usedAi = false;
    let aiAttemptCount = 0;
    let finalFallbackReason: string | null = null;
    const aiRuntime = aiRuntimeSummary();

    const blueprints: MissionBlueprint[] = [];
    for (const rankedPattern of ranked) {
      if (rankedPattern.rejectedReasons.length > 0) continue;

      let usedFacts = rankedPattern.usedFacts;
      if (!usedFacts.length) {
        usedFacts = [await ensureColdStartFact(supabaseAdmin, userId, rankedPattern.pattern.category)];
        facts = [...facts.filter((fact) => fact.fact_key !== usedFacts[0].fact_key), ...usedFacts];
      }

      const fallbackCandidate = buildFallbackCandidate(
        rankedPattern.pattern,
        usedFacts,
        profile,
        missionType,
      );

      blueprints.push({ rankedPattern, fallbackCandidate });
      if (blueprints.length >= MAX_AI_BLUEPRINTS) break;
    }

    const aiComposition = blueprints.length
      ? await composeMissionCandidatesWithAi(blueprints, {
        user_level: userLevel,
        max_difficulty: maxDifficulty,
        max_cost: maxCost,
        time_budget_minutes: timeBudget,
        facts: facts.slice(0, 24).map((fact) => ({
          fact_key: fact.fact_key,
          fact_type: fact.fact_type,
          category: fact.category,
          label: factLabel(fact),
          confidence: fact.confidence,
        })),
        recent_history: {
          recent_pattern_keys: [...recentPatternKeys],
          recent_action_fingerprints: [...recentActionFingerprints],
          recent_categories: recentCategoryCounts,
          active_categories: activeCategoryCounts,
        },
      })
      : {
        candidates: [] as MissionCandidate[],
        usedAi: false,
        fallbackReason: "no_valid_blueprint_after_filters",
      };
    aiAttemptCount = aiComposition.usedAi ? aiComposition.candidates.length : blueprints.length;

    const blueprintByPatternKey = new Map(
      blueprints.map((blueprint) => [blueprint.fallbackCandidate.pattern_key, blueprint]),
    );
    const candidateAttempts: AiCompositionAttempt[] = [
      ...aiComposition.candidates.map((candidate) => ({
        candidate,
        source: "ai" as const,
        fallbackReason: null,
      })),
      ...blueprints.map((blueprint) => ({
        candidate: blueprint.fallbackCandidate,
        source: "fallback" as const,
        fallbackReason: aiComposition.fallbackReason ?? "deterministic_contextual_fallback",
      })),
    ];

    for (const attempt of candidateAttempts) {
      const blueprint = blueprintByPatternKey.get(attempt.candidate.pattern_key);
      const validation = validateCandidate(attempt.candidate, {
        facts,
        recentMissions: recentMissions ?? [],
        recentPatternKeys,
        recentActionFingerprints,
        userLevel,
      });

      if (validation.valid && blueprint) {
        finalCandidate = attempt.candidate;
        selectedPattern = blueprint.rankedPattern.pattern;
        usedAi = attempt.source === "ai";
        usedFallback = attempt.source === "fallback";
        finalFallbackReason = usedFallback
          ? aiComposition.usedAi
            ? "ai_candidates_invalid_deterministic_fallback"
            : attempt.fallbackReason
          : null;
        break;
      }

      validationErrors.push({
        pattern_key: attempt.candidate.pattern_key,
        action_fingerprint: attempt.candidate.action_fingerprint,
        source: attempt.source,
        ai_used: attempt.source === "ai",
        errors: validation.errors,
        warnings: validation.warnings,
        ai_fallback_reason: attempt.fallbackReason,
      });

      if (!blueprint) {
        validationErrors.push({
          pattern_key: attempt.candidate.pattern_key,
          source: attempt.source,
          errors: ["unknown_pattern_key_from_ai_candidate"],
        });
      }
    }

    if (!finalCandidate || !selectedPattern) {
      const errorGenerationSnapshot = {
        ...generationSnapshot,
        ai: {
          ...aiRuntime,
          ai_used: false,
          ai_stage: "mission_composer",
          fallback_reason: "no_valid_pattern_candidate",
          candidate_count: aiAttemptCount,
          blueprint_count: blueprints.length,
          ai_candidate_count: aiComposition.candidates.length,
          validation_error_count: validationErrors.length,
        },
      };

      await writeGenerationLog(supabaseAdmin, {
        userId,
        missionType,
        candidatePatternKeys,
        rejectedCandidates,
        validationErrors,
        generationSnapshot: errorGenerationSnapshot,
        usedFallback: true,
        status: "error",
        errorMessage: "no_valid_pattern_candidate",
      });

      return jsonResponse({
        error: "no_valid_pattern_candidate",
        message: "Não encontrei um pattern válido para o perfil atual.",
      }, 422);
    }

    const missionId = crypto.randomUUID();
    const expiresInHours = missionWindowDays(missionType) * 24;
    const now = new Date().toISOString();
    const finalGenerationSnapshot = {
      ...generationSnapshot,
      ai: {
        ...aiRuntime,
        ai_used: usedAi,
        ai_stage: "mission_composer",
        fallback_reason: usedFallback
          ? finalFallbackReason ?? "deterministic_contextual_fallback"
          : null,
        candidate_count: aiAttemptCount,
        blueprint_count: blueprints.length,
        ai_candidate_count: aiComposition.candidates.length,
        validation_error_count: validationErrors.length,
      },
    };

    const insertPayload = {
      id: missionId,
      user_id: userId,
      title: finalCandidate.title,
      description: finalCandidate.description,
      ai_justification: {
        ...finalCandidate.ai_justification,
        category: finalCandidate.category,
        reason: finalCandidate.personalization_reason,
        mission_type: missionType,
        used_ai_for_text: usedAi,
        action_fingerprint: finalCandidate.action_fingerprint,
      },
      feedback_notes: {},
      status: "active",
      mission_type: missionType,
      category: finalCandidate.category,
      environmental_goal: finalCandidate.environmental_goal,
      difficulty: finalCandidate.difficulty,
      effort_minutes: finalCandidate.effort_minutes,
      cost_level: finalCandidate.cost_level,
      xp_reward: finalCandidate.xp_reward,
      used_fact_keys: finalCandidate.used_fact_keys,
      personalization_reason: finalCandidate.personalization_reason,
      generation_snapshot: finalGenerationSnapshot,
      expected_impact: finalCandidate.expected_impact,
      pattern_key: finalCandidate.pattern_key,
      action_fingerprint: finalCandidate.action_fingerprint,
      generation_request_id: generationRequestId,
      created_at: now,
      expires_at: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
    };

    const { error: insertError } = await supabaseAdmin
      .from("user_missions")
      .insert(insertPayload);

    if (insertError && generationRequestId && insertError.code === "23505") {
      const existing = await findMissionByGenerationRequest(
        supabaseAdmin,
        userId,
        generationRequestId,
      );

      if (existing) {
        console.log("[MISSION_GEN] Conflito idempotente resolvido.", {
          userId,
          missionType,
          generationRequestId,
          missionId: existing.id,
        });

        return jsonResponse({
          success: true,
          mission_id: existing.id,
          pattern_key: existing.pattern_key ?? null,
          action_fingerprint: existing.action_fingerprint ?? null,
          category: existing.category ?? null,
          mission_status: existing.status,
          mission_type: existing.mission_type ?? missionType,
          client_request_id: generationRequestId,
          idempotent: true,
          message: "mission_already_created",
        });
      }
    }

    if (insertError) {
      throw new Error(`Erro ao salvar missão: ${insertError.message}`);
    }

    await writeGenerationLog(supabaseAdmin, {
      userId,
      missionId,
      missionType,
      candidatePatternKeys,
      selectedPatternKey: selectedPattern.key,
      selectedActionFingerprint: finalCandidate.action_fingerprint,
      rejectedCandidates,
      validationErrors,
      generationSnapshot: finalGenerationSnapshot,
      usedFallback,
      status: usedFallback ? "fallback" : "success",
    });

    await logAgentInteraction(supabaseAdmin, {
      userId,
      agent: "adventurer",
      eventType: "GENERATE_MISSION",
      inputSummary: {
        missionType,
        generationRequestId,
        activeMissionCount,
        selectedPatternKey: selectedPattern.key,
        selectedActionFingerprint: finalCandidate.action_fingerprint,
        usedFallback,
        usedAi,
      },
      output: {
        mission_id: missionId,
        category: finalCandidate.category,
        difficulty: finalCandidate.difficulty,
        used_fact_keys: finalCandidate.used_fact_keys,
        pattern_key: selectedPattern.key,
        action_fingerprint: finalCandidate.action_fingerprint,
      },
    });

    console.log("[MISSION_GEN] Missão criada por pattern.", {
      userId,
      missionId,
      missionType,
      patternKey: selectedPattern.key,
      actionFingerprint: finalCandidate.action_fingerprint,
      category: finalCandidate.category,
      difficulty: finalCandidate.difficulty,
      aiUsed: usedAi,
      aiStage: "mission_composer",
      aiProvider: aiRuntime.ai_provider,
      aiModel: aiRuntime.ai_model,
      fallbackReason: usedFallback
        ? finalFallbackReason ?? "deterministic_contextual_fallback"
        : null,
      candidateCount: aiAttemptCount,
      blueprintCount: blueprints.length,
      aiCandidateCount: aiComposition.candidates.length,
      usedFallback,
      generationRequestId,
    });

    return jsonResponse({
      success: true,
      mission_id: missionId,
      client_request_id: generationRequestId,
      pattern_key: selectedPattern.key,
      action_fingerprint: finalCandidate.action_fingerprint,
      ai_used: usedAi,
      used_fallback: usedFallback,
      fallback_reason: usedFallback
        ? finalFallbackReason ?? "deterministic_contextual_fallback"
        : null,
      message: "mission_created",
    });
  } catch (error: any) {
    console.error("[MISSION_GEN] Erro crítico:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
