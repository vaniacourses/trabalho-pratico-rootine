export const MISSION_EDIT_SCHEMA_VERSION = 1;
export const MISSION_EDIT_ALGORITHM_VERSION = "safe_mission_edit_v1";

export const ISSUE_TYPES = [
  "time",
  "cost",
  "access",
  "health",
  "safety",
  "preference",
  "already_doing",
  "too_easy",
  "too_hard",
  "unclear",
] as const;

export const CONSTRAINT_STRENGTHS = ["hard", "soft", "temporary"] as const;

export const FACT_TYPES = [
  "constraint",
  "deficit",
  "capability",
  "preference",
  "interest",
  "habit",
  "context",
  "goal",
  "risk",
] as const;

export type IssueType = typeof ISSUE_TYPES[number];
export type ConstraintStrength = typeof CONSTRAINT_STRENGTHS[number];
export type FactType = typeof FACT_TYPES[number];

export interface FeedbackFactCandidate {
  fact_key: string;
  fact_type: FactType;
  category: string | null;
  value: Record<string, unknown>;
  confidence: number;
}

export interface FeedbackClassificationV1 {
  issue_type: IssueType;
  constraint_strength: ConstraintStrength;
  blocked_actions: string[];
  allowed_adjustments: string[];
  new_fact_candidates: FeedbackFactCandidate[];
  raw_text_summary: string;
  confidence: number;
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
    : [];
}

export function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToken(value: unknown) {
  return normalizeText(value).replace(/[\s.-]+/g, "_");
}

export function summarizeFeedback(value: unknown) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 220);
}

export function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function normalizeIssueType(value: unknown): IssueType {
  const normalized = normalizeToken(value);
  const aliases: Record<string, IssueType> = {
    tempo: "time",
    time_limit: "time",
    falta_de_tempo: "time",
    dinheiro: "cost",
    custo: "cost",
    costs: "cost",
    money: "cost",
    acesso: "access",
    controle: "access",
    health_safety: "health",
    saude: "health",
    remedio: "health",
    medicamento: "health",
    seguranca: "safety",
    seguro: "safety",
    preferencia: "preference",
    ja_faco: "already_doing",
    already_done: "already_doing",
    already_do: "already_doing",
    muito_facil: "too_easy",
    facil_demais: "too_easy",
    muito_dificil: "too_hard",
    dificil_demais: "too_hard",
    hard: "too_hard",
    ambiguous: "unclear",
    claro: "unclear",
  };

  if (ISSUE_TYPES.includes(normalized as IssueType)) return normalized as IssueType;
  return aliases[normalized] ?? "unclear";
}

export function normalizeConstraintStrength(value: unknown, issueType: IssueType): ConstraintStrength {
  const normalized = normalizeToken(value);
  const aliases: Record<string, ConstraintStrength> = {
    permanente: "hard",
    forte: "hard",
    alto: "hard",
    medium: "soft",
    medio: "soft",
    baixa: "soft",
    baixo: "soft",
    temporario: "temporary",
    temporaria: "temporary",
    hoje: "temporary",
  };

  if (CONSTRAINT_STRENGTHS.includes(normalized as ConstraintStrength)) {
    return normalized as ConstraintStrength;
  }
  if (aliases[normalized]) return aliases[normalized];
  if (issueType === "health" || issueType === "safety" || issueType === "access") return "hard";
  if (issueType === "time" || issueType === "cost" || issueType === "too_hard") return "soft";
  return "temporary";
}

export function normalizeFactType(value: unknown, fallback: FactType = "context"): FactType {
  const normalized = normalizeToken(value);
  if (normalized === "hard_block") return "constraint";
  if (normalized === "deficit") return "deficit";
  if (FACT_TYPES.includes(normalized as FactType)) return normalized as FactType;
  return fallback;
}

export function inferIssueTypeFromText(feedbackText: string): IssueType {
  const text = normalizeText(feedbackText);

  if (/\b(remedio|medicamento|saude|dor|medico|tratamento|banho longo por cuidado)\b/.test(text)) return "health";
  if (/\b(perigoso|risco|inseguro|seguranca|chuva|calor|rua)\b/.test(text)) return "safety";
  if (/\b(nao tenho acesso|sem acesso|nao controlo|nao tenho controle|nao posso acessar|nao sei|sem habilidade|nao tenho habilidade|nao consigo usar|nao tenho carona|sem carona|carona indisponivel|nao tenho carona disponivel)\b/.test(text)) return "access";
  if (/\b(dinheiro|caro|custo|gasto|comprar|sem grana|apertado)\b/.test(text)) return "cost";
  if (/\b(prefiro|gostaria|melhor|nao gosto|não gosto)\b/.test(text)) return "preference";
  if (/\b(tempo|demora|manha|noite|correria|ocupado|rapido|minutos)\b/.test(text)) return "time";
  if (/\b(ja faco|ja faço|faco isso|faço isso|habito meu)\b/.test(text)) return "already_doing";
  if (/\b(muito facil|facil demais|mais dificil|desafio maior)\b/.test(text)) return "too_easy";
  if (/\b(muito dificil|dificil demais|nao consigo|não consigo|pesado|complicado)\b/.test(text)) return "too_hard";
  return "unclear";
}

export function inferBlockedActionsFromText(feedbackText: string) {
  const text = normalizeText(feedbackText);
  const blocked: string[] = [];

  if (/\b(bike|bicicleta|pedalar|ciclovia|ciclismo)\b/.test(text)) {
    blocked.push("bike", "bicicleta", "pedalar");
  }
  if (/\b(carona|caronas|carpool|compartilhar carona|compartir caronas|sem carona|nao tenho carona)\b/.test(text)) {
    blocked.push("carona", "caronas", "carpool", "compartilhar_carona", "compartir_caronas");
  }

  return [...new Set(blocked)];
}

function defaultAllowedAdjustments(issueType: IssueType) {
  switch (issueType) {
    case "time":
      return ["reduce_effort_minutes", "move_to_better_routine_moment", "keep_cost_free"];
    case "cost":
      return ["force_free_cost", "reuse_existing_resources", "avoid_purchase"];
    case "access":
      return ["switch_action", "respect_access_limit", "avoid_blocked_action"];
    case "health":
      return ["protect_health_step", "reduce_only_safe_part", "avoid_medical_advice"];
    case "safety":
      return ["avoid_unsafe_context", "switch_to_home_or_low_risk_action"];
    case "already_doing":
      return ["increase_novelty", "switch_pattern", "raise_difficulty_carefully"];
    case "too_easy":
      return ["raise_difficulty_carefully", "add_observation_or_tracking"];
    case "too_hard":
      return ["lower_difficulty", "reduce_effort_minutes", "keep_same_goal"];
    case "preference":
      return ["adapt_timing_or_object", "keep_environmental_goal"];
    default:
      return ["conservative_safe_edit", "keep_environmental_goal"];
  }
}

export function buildFeedbackFactCandidate(input: {
  issueType: IssueType;
  strength: ConstraintStrength;
  category: string | null;
  actionFingerprint?: string | null;
  summary: string;
}): FeedbackFactCandidate | null {
  const { issueType, strength, category, actionFingerprint, summary } = input;
  const categoryPart = category ? normalizeToken(category) : "general";
  const actionPart = actionFingerprint ? normalizeToken(actionFingerprint).slice(0, 80) : "mission";

  if (issueType === "unclear") return null;

  const factTypeByIssue: Record<IssueType, FactType> = {
    time: "constraint",
    cost: "constraint",
    access: "constraint",
    health: "constraint",
    safety: "risk",
    preference: "preference",
    already_doing: "capability",
    too_easy: "preference",
    too_hard: "constraint",
    unclear: "context",
  };

  const keyByIssue: Record<IssueType, string> = {
    time: "time_limit",
    cost: "cost_limit",
    access: "access_limit",
    health: "health_limit",
    safety: "safety_limit",
    preference: "preference",
    already_doing: "already_doing",
    too_easy: "wants_more_challenge",
    too_hard: "difficulty_limit",
    unclear: "unclear",
  };

  return {
    fact_key: `feedback.${categoryPart}.${keyByIssue[issueType]}.${actionPart}`,
    fact_type: factTypeByIssue[issueType],
    category,
    value: {
      issue_type: issueType,
      constraint_strength: strength,
      summary,
      action_fingerprint: actionFingerprint ?? null,
      source: "mission_edit_feedback",
      hard_block: false,
    },
    confidence: issueType === "health" || issueType === "safety" || strength === "hard" ? 0.86 : 0.74,
  };
}

export function normalizeFeedbackClassification(
  raw: unknown,
  fallbackText: string,
  missionCategory: string | null,
  actionFingerprint?: string | null,
): FeedbackClassificationV1 {
  const rawObject = asObject(raw);
  const inferredIssueType = inferIssueTypeFromText(fallbackText);
  let issueType = normalizeIssueType(rawObject.issue_type ?? inferredIssueType);
  if (
    ["health", "safety", "access", "cost"].includes(inferredIssueType) &&
    ["preference", "unclear", "too_hard"].includes(issueType)
  ) {
    issueType = inferredIssueType;
  }
  const strength = normalizeConstraintStrength(rawObject.constraint_strength, issueType);
  const summary = summarizeFeedback(rawObject.raw_text_summary ?? rawObject.summary ?? fallbackText);
  const fact = buildFeedbackFactCandidate({
    issueType,
    strength,
    category: missionCategory,
    actionFingerprint,
    summary,
  });

  const normalizedFactCandidates = Array.isArray(rawObject.new_fact_candidates)
    ? rawObject.new_fact_candidates
      .map((candidate) => {
        const object = asObject(candidate);
        const factType = normalizeFactType(object.fact_type, fact?.fact_type ?? "context");
        const factKey = typeof object.fact_key === "string" && object.fact_key.trim()
          ? normalizeText(object.fact_key).replace(/\s+/g, ".")
          : null;
        if (!factKey) return null;
        return {
          fact_key: factKey,
          fact_type: factType,
          category: typeof object.category === "string" ? normalizeToken(object.category) : missionCategory,
          value: asObject(object.value),
          confidence: clamp(numberValue(object.confidence, 0.72), 0, 1),
        } satisfies FeedbackFactCandidate;
      })
      .filter((candidate): candidate is FeedbackFactCandidate => Boolean(candidate))
    : [];

  return {
    issue_type: issueType,
    constraint_strength: strength,
    blocked_actions: [
      ...stringArray(rawObject.blocked_actions).map(normalizeToken),
      ...inferBlockedActionsFromText(fallbackText).map(normalizeToken),
    ].filter((value, index, array) => array.indexOf(value) === index).slice(0, 8),
    allowed_adjustments: stringArray(rawObject.allowed_adjustments).length
      ? stringArray(rawObject.allowed_adjustments).map(normalizeToken).slice(0, 8)
      : defaultAllowedAdjustments(issueType),
    new_fact_candidates: [
      ...(fact ? [fact] : []),
      ...normalizedFactCandidates,
    ].slice(0, 4),
    raw_text_summary: summary,
    confidence: clamp(numberValue(rawObject.confidence, fact ? fact.confidence : 0.55), 0, 1),
  };
}

export function hasUsefulStructuredFeedback(classification: FeedbackClassificationV1) {
  return classification.issue_type !== "unclear" && classification.new_fact_candidates.length > 0;
}
