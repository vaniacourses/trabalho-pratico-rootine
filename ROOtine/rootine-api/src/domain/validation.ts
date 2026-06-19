import {
  isCostLevel,
  isSustainabilityCategory,
  type SustainabilityCategory,
} from "./categories";
import { isProfileFactType, type ProfileFact } from "./facts";
import {
  hasPositiveImpact,
  isImpactMetricKey,
  type ImpactEstimate,
} from "./impact";
import { getMissionText, normalizeMissionText, type MissionCandidate } from "./missions";
import {
  isFeedbackKind,
  isFeedbackSeverity,
} from "./profile";
import { getLevelFromXp, getMissionXpReward } from "./xp";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface MissionValidationOptions {
  facts?: ProfileFact[];
  userLevel?: number;
  recentMissionTexts?: string[];
  recentPatternKeys?: string[];
}

const POSITIVE_ENVIRONMENTAL_TERMS = [
  "reduce",
  "reduction",
  "reuse",
  "repair",
  "avoid",
  "save",
  "separate",
  "compost",
  "recycle",
  "lower",
  "minimize",
  "economizar",
  "reduzir",
  "evitar",
  "reutilizar",
  "separar",
  "reciclar",
  "consertar",
  "diminuir",
  "compostar",
  "desperdicio",
  "emissao",
  "residuo",
  "agua",
  "energia",
  "co2",
  "consumo",
];

const GENERIC_MISSION_PATTERNS = [
  "missao da pequena mudanca",
  "acao simples e sustentavel",
  "praticar hoje por pelo menos 10 minutos",
  "escolha uma acao simples",
];

const CONSUMPTION_INCREASE_PATTERNS = [
  "compre mais",
  "comprar mais",
  "aumente o consumo",
  "use mais agua",
  "use mais energia",
  "deixe ligado",
  "jogue fora",
  "descarte mais",
  "troque por um novo",
  "banho mais longo",
];

const JUSTIFIED_CONSUMPTION_TERMS = [
  "sem comprar",
  "segunda mao",
  "usado",
  "reparo",
  "conserto",
  "duravel",
  "substituir descartavel",
  "evitar descartavel",
];

function result(errors: string[], warnings: string[] = []): ValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown, minLength = 1): value is string {
  return typeof value === "string" && value.trim().length >= minLength;
}

function hasGenericMissionText(candidate: MissionCandidate) {
  const text = normalizeMissionText(getMissionText(candidate));
  return GENERIC_MISSION_PATTERNS.some((pattern) => text.includes(pattern));
}

function increasesConsumptionWithoutJustification(candidate: MissionCandidate) {
  const text = normalizeMissionText(getMissionText(candidate));
  const hasIncrease = CONSUMPTION_INCREASE_PATTERNS.some((pattern) => text.includes(pattern));
  if (!hasIncrease) return false;

  const hasJustification = JUSTIFIED_CONSUMPTION_TERMS.some((pattern) => text.includes(pattern));
  return !hasJustification;
}

function similarityScore(left: string, right: string) {
  const leftTokens = new Set(normalizeMissionText(left).split(" ").filter((token) => token.length > 3));
  const rightTokens = new Set(normalizeMissionText(right).split(" ").filter((token) => token.length > 3));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

export function validateEnvironmentalGoal(goal: unknown): ValidationResult {
  const errors: string[] = [];
  const normalized = hasText(goal) ? normalizeMissionText(goal) : "";

  if (!hasText(goal, 8)) {
    errors.push("environmental_goal_required");
  }

  if (normalized && !POSITIVE_ENVIRONMENTAL_TERMS.some((term) => normalized.includes(term))) {
    errors.push("environmental_goal_not_positive_or_explicit");
  }

  if (
    normalized.includes("sem objetivo") ||
    normalized.includes("none") ||
    normalized.includes("generic")
  ) {
    errors.push("environmental_goal_generic");
  }

  return result([...new Set(errors)]);
}

export function validateImpactEstimate(impact: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(impact)) {
    return result(["expected_impact_required"]);
  }

  const keys = Object.keys(impact);
  if (keys.length === 0) {
    errors.push("expected_impact_empty");
  }

  for (const key of keys) {
    if (!isImpactMetricKey(key)) {
      errors.push(`impact_metric_invalid:${key}`);
      continue;
    }

    const range = impact[key];
    if (!isObject(range)) {
      errors.push(`impact_range_invalid:${key}`);
      continue;
    }

    const low = Number(range.low);
    const mid = Number(range.mid);
    const high = Number(range.high);
    const confidence = Number(range.confidence);

    if (![low, mid, high, confidence].every(Number.isFinite)) {
      errors.push(`impact_range_non_numeric:${key}`);
      continue;
    }

    if (low < 0 || mid < 0 || high < 0) {
      errors.push(`impact_range_negative:${key}`);
    }

    if (!(low <= mid && mid <= high)) {
      errors.push(`impact_range_order:${key}`);
    }

    if (confidence < 0 || confidence > 1) {
      errors.push(`impact_confidence_out_of_range:${key}`);
    }
  }

  return result([...new Set(errors)]);
}

export function validateMissionPersonalization(
  candidate: Partial<MissionCandidate>,
  options: MissionValidationOptions = {},
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const usedFactKeys = Array.isArray(candidate.used_fact_keys)
    ? candidate.used_fact_keys.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];

  if (usedFactKeys.length === 0) {
    errors.push("used_fact_keys_required");
  }

  if (!hasText(candidate.personalization_reason, 20)) {
    errors.push("personalization_reason_required");
  }

  const normalizedReason = normalizeMissionText(String(candidate.personalization_reason ?? ""));
  if (
    normalizedReason.includes("dados disponiveis ainda nao foram suficientes") ||
    normalizedReason.includes("personalizacao mais precisa") ||
    normalizedReason.includes("missao acessivel porque")
  ) {
    errors.push("personalization_reason_generic");
  }

  if (options.facts?.length) {
    const activeFactKeys = new Set(
      options.facts.filter((fact) => fact.active !== false).map((fact) => fact.fact_key),
    );

    for (const factKey of usedFactKeys) {
      const allowedColdStart = factKey.startsWith("cold_start.");
      if (!allowedColdStart && !activeFactKeys.has(factKey)) {
        errors.push(`used_fact_key_not_found:${factKey}`);
      }
    }
  }

  if (candidate.pattern_key && options.recentPatternKeys?.includes(candidate.pattern_key)) {
    errors.push("pattern_repeated_recently");
  }

  if (hasText(candidate.title) && hasText(candidate.description) && options.recentMissionTexts?.length) {
    const missionText = `${candidate.title} ${candidate.description}`;
    const similarRecent = options.recentMissionTexts.some(
      (recent) => similarityScore(missionText, recent) >= 0.72,
    );
    if (similarRecent) {
      errors.push("mission_semantically_repeated_recently");
    }
  }

  if (usedFactKeys.some((factKey) => factKey.startsWith("cold_start."))) {
    warnings.push("cold_start_fact_used");
  }

  return result([...new Set(errors)], [...new Set(warnings)]);
}

export function validateProfileFact(fact: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(fact)) {
    return result(["profile_fact_required"]);
  }

  if (!hasText(fact.fact_key, 4)) {
    errors.push("fact_key_required");
  }

  if (!isProfileFactType(fact.fact_type)) {
    errors.push("fact_type_invalid");
  }

  if (fact.category !== undefined && fact.category !== null && !isSustainabilityCategory(fact.category)) {
    errors.push("fact_category_invalid");
  }

  const confidence = Number(fact.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push("fact_confidence_out_of_range");
  }

  if (fact.source_event_ids !== undefined && !Array.isArray(fact.source_event_ids)) {
    errors.push("fact_source_event_ids_invalid");
  }

  return result(errors);
}

export function validateFeedbackClassification(feedback: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(feedback)) {
    return result(["feedback_classification_required"]);
  }

  if (!isFeedbackKind(feedback.kind)) {
    errors.push("feedback_kind_invalid");
  }

  if (!hasText(feedback.summary, 8)) {
    errors.push("feedback_summary_required");
  }

  if (feedback.severity !== undefined && !isFeedbackSeverity(feedback.severity)) {
    errors.push("feedback_severity_invalid");
  }

  if (feedback.category !== undefined && !isSustainabilityCategory(feedback.category)) {
    errors.push("feedback_category_invalid");
  }

  if (
    (feedback.kind === "constraint" ||
      feedback.kind === "hard_block" ||
      feedback.creates_hard_block === true) &&
    !hasText(feedback.fact_key, 6)
  ) {
    errors.push("feedback_fact_key_required_for_constraint");
  }

  if (hasText(feedback.raw_text_summary) && (feedback.raw_text_summary as string).length > 280) {
    warnings.push("feedback_raw_text_summary_long");
  }

  return result(errors, warnings);
}

export function validateMissionCandidate(
  candidate: unknown,
  options: MissionValidationOptions = {},
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(candidate)) {
    return result(["mission_candidate_required"]);
  }

  const mission = candidate as Partial<MissionCandidate>;

  if (!hasText(mission.title, 4)) errors.push("title_required");
  if (!hasText(mission.description, 20)) errors.push("description_required");
  if (!isSustainabilityCategory(mission.category)) errors.push("category_invalid");
  if (!isCostLevel(mission.cost_level)) errors.push("cost_level_invalid");

  const difficulty = Number(mission.difficulty);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    errors.push("difficulty_invalid");
  }

  const effortMinutes = Number(mission.effort_minutes);
  if (!Number.isFinite(effortMinutes) || effortMinutes < 0 || effortMinutes > 240) {
    errors.push("effort_minutes_invalid");
  }

  const goalResult = validateEnvironmentalGoal(mission.environmental_goal);
  errors.push(...goalResult.errors);
  warnings.push(...goalResult.warnings);

  const personalizationResult = validateMissionPersonalization(mission, options);
  errors.push(...personalizationResult.errors);
  warnings.push(...personalizationResult.warnings);

  const impactResult = validateImpactEstimate(mission.expected_impact);
  errors.push(...impactResult.errors);
  warnings.push(...impactResult.warnings);

  if (impactResult.valid && !hasPositiveImpact(mission.expected_impact as ImpactEstimate)) {
    errors.push("expected_impact_must_have_positive_metric");
  }

  if (!errors.includes("title_required") && !errors.includes("description_required")) {
    if (hasGenericMissionText(mission as MissionCandidate)) {
      errors.push("generic_fallback_mission");
    }

    if (increasesConsumptionWithoutJustification(mission as MissionCandidate)) {
      errors.push("mission_increases_consumption_without_justification");
    }
  }

  if (options.userLevel !== undefined && options.userLevel >= 7 && difficulty <= 1 && effortMinutes <= 5) {
    errors.push("mission_too_trivial_for_experienced_user");
  }

  if (mission.xp_reward !== undefined) {
    const expectedReward = getMissionXpReward(difficulty);
    if (expectedReward > 0 && mission.xp_reward !== expectedReward) {
      warnings.push("xp_reward_does_not_match_difficulty");
    }
  }

  return result([...new Set(errors)], [...new Set(warnings)]);
}

export type { SustainabilityCategory };
