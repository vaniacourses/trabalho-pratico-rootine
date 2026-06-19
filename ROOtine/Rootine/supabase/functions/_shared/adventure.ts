export { awardXpWithDailyCap } from "./progress.ts";
export type { XpAwardResult } from "./progress.ts";

export const ADVENTURE_CATEGORIES = [
  "water",
  "energy",
  "waste",
  "transport",
  "food",
  "consumption",
] as const;

export type AdventureCategory = typeof ADVENTURE_CATEGORIES[number];

export const ADVENTURE_SCHEMA_VERSION = 1;
export const ADVENTURE_ALGORITHM_VERSION = "deterministic_adventure_v1";
export const FLASHCARD_BATCH_SIZE = 10;
export const FLASHCARD_RECENT_DAYS = 7;
export const FLASHCARD_MAX_PER_CATEGORY = 3;
export const FLASHCARD_ANSWER_XP = 0;
export const FLASHCARD_COMPLETION_XP = 4;
export const QUIZ_CORRECT_XP = 2;
export const QUIZ_REVIEW_XP = 0;
export const QUIZ_DAILY_XP_CAP = 8;

export interface FlashcardCatalogRow {
  id: string;
  question: string;
  category: AdventureCategory;
  signal_key: string;
  signal_type: string;
  true_effect?: Record<string, unknown> | null;
  false_effect?: Record<string, unknown> | null;
  skip_effect?: Record<string, unknown> | null;
  difficulty?: number | null;
  weight?: number | null;
}

export interface QuizQuestionRow {
  id: string;
  category: AdventureCategory;
  question: string;
  options: Array<{ id: string; text: string }>;
  correct_option: string;
  explanation: string;
  difficulty: number;
  signal_key?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function isAdventureCategory(value: unknown): value is AdventureCategory {
  return typeof value === "string" && ADVENTURE_CATEGORIES.includes(value as AdventureCategory);
}

export function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashScore(input: string) {
  return stableHash(input) / 4294967295;
}

export function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date = new Date()) {
  return `${utcDayKey(date)}T00:00:00.000Z`;
}

function normalizeNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function eventSafeEffect(effect: Record<string, unknown> | null | undefined) {
  if (!effect || typeof effect !== "object") return {};
  return {
    fact_type: normalizeFactType(effect.fact_type),
    confidence: effect.confidence,
    value: effect.value,
    affinity_delta: effect.affinity_delta,
  };
}

function normalizeFactType(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalized === "deficit") return "deficit";
  return value;
}

export function getFlashcardEffect(
  flashcard: FlashcardCatalogRow,
  answer: boolean | null,
) {
  if (answer === true) return flashcard.true_effect ?? {};
  if (answer === false) return flashcard.false_effect ?? {};
  return flashcard.skip_effect ?? {};
}

export function buildFlashcardFact(
  flashcard: FlashcardCatalogRow,
  answer: boolean | null,
  eventId: string,
) {
  if (answer === null) return null;

  const effect = getFlashcardEffect(flashcard, answer);
  if (effect?.profile_update === false) return null;

  const factType = typeof effect.fact_type === "string"
    ? normalizeFactType(effect.fact_type)
    : answer
      ? flashcard.signal_type
      : "deficit";

  const confidence = Math.max(0, Math.min(1, normalizeNumber(effect.confidence, 0.72)));

  return {
    user_id: "",
    fact_key: `adventure.flashcard.${flashcard.signal_key}`,
    fact_type: factType,
    category: flashcard.category,
    value: {
      answer,
      question: flashcard.question,
      signal_key: flashcard.signal_key,
      signal_type: flashcard.signal_type,
      effect: eventSafeEffect(effect),
      source: "flashcard_answer",
      algorithm: ADVENTURE_ALGORITHM_VERSION,
    },
    confidence,
    source_event_ids: [eventId],
    active: true,
    derived_by: ADVENTURE_ALGORITHM_VERSION,
    evidence_count: 1,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function buildQuizFact(
  quizQuestion: QuizQuestionRow,
  correct: boolean,
  selectedOption: string,
  eventId: string,
) {
  return {
    user_id: "",
    fact_key: correct
      ? `adventure.quiz.${quizQuestion.category}.knowledge_strength`
      : `adventure.quiz.${quizQuestion.category}.learning_need`,
    fact_type: correct ? "capability" : "deficit",
    category: quizQuestion.category,
    value: {
      correct,
      selected_option: selectedOption,
      quiz_question_id: quizQuestion.id,
      signal_key: quizQuestion.signal_key,
      difficulty: quizQuestion.difficulty,
      source: "quiz_answer",
      algorithm: ADVENTURE_ALGORITHM_VERSION,
    },
    confidence: correct ? 0.7 : 0.68,
    source_event_ids: [eventId],
    active: true,
    derived_by: ADVENTURE_ALGORITHM_VERSION,
    evidence_count: 1,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function selectBalancedFlashcards(
  flashcards: FlashcardCatalogRow[],
  recentFlashcardIds: Set<string>,
  userId: string,
  dateKey = utcDayKey(),
) {
  const valid = flashcards.filter((card) =>
    isAdventureCategory(card.category) &&
    typeof card.signal_key === "string" &&
    typeof card.signal_type === "string"
  );

  const preferred = valid.filter((card) => !recentFlashcardIds.has(card.id));
  const pool = preferred.length >= FLASHCARD_BATCH_SIZE ? preferred : valid;
  const seed = `${userId}:${dateKey}:flashcards`;

  const ranked = [...pool].sort((left, right) => {
    const leftScore = hashScore(`${seed}:${left.category}:${left.signal_type}:${left.id}`);
    const rightScore = hashScore(`${seed}:${right.category}:${right.signal_type}:${right.id}`);
    return leftScore - rightScore;
  });

  const selected: FlashcardCatalogRow[] = [];
  const categoryCounts: Record<string, number> = {};

  const categoryOrder = [...ADVENTURE_CATEGORIES].sort((left, right) =>
    hashScore(`${seed}:category:${left}`) - hashScore(`${seed}:category:${right}`)
  );

  for (const category of categoryOrder) {
    const next = ranked.find((card) =>
      card.category === category &&
      !selected.some((selectedCard) => selectedCard.id === card.id)
    );
    if (!next) continue;
    selected.push(next);
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    if (selected.length === FLASHCARD_BATCH_SIZE) return selected;
  }

  for (const card of ranked) {
    if (selected.some((selectedCard) => selectedCard.id === card.id)) continue;
    const currentCount = categoryCounts[card.category] ?? 0;
    if (currentCount >= FLASHCARD_MAX_PER_CATEGORY) continue;

    selected.push(card);
    categoryCounts[card.category] = currentCount + 1;
    if (selected.length === FLASHCARD_BATCH_SIZE) break;
  }

  if (selected.length < FLASHCARD_BATCH_SIZE) {
    for (const card of ranked) {
      if (selected.some((selectedCard) => selectedCard.id === card.id)) continue;
      selected.push(card);
      if (selected.length === FLASHCARD_BATCH_SIZE) break;
    }
  }

  return selected;
}

export function selectDeterministicQuizQuestion(
  questions: QuizQuestionRow[],
  recentQuestionIds: Set<string>,
  affinities: Record<string, unknown>,
  userId: string,
  dateKey = utcDayKey(),
) {
  const valid = questions.filter((question) => isAdventureCategory(question.category));
  const preferred = valid.filter((question) => !recentQuestionIds.has(question.id));
  const pool = preferred.length > 0 ? preferred : valid;
  const seed = `${userId}:${dateKey}:quiz`;

  const categoryPriority = Object.fromEntries(
    [...ADVENTURE_CATEGORIES]
      .sort((left, right) => {
        const leftAffinity = normalizeNumber(affinities[left], 0);
        const rightAffinity = normalizeNumber(affinities[right], 0);
        if (leftAffinity !== rightAffinity) return leftAffinity - rightAffinity;
        return hashScore(`${seed}:category:${left}`) - hashScore(`${seed}:category:${right}`);
      })
      .map((category, index) => [category, index]),
  );

  return [...pool].sort((left, right) => {
    const leftCategoryPriority = categoryPriority[left.category] ?? 99;
    const rightCategoryPriority = categoryPriority[right.category] ?? 99;
    if (leftCategoryPriority !== rightCategoryPriority) {
      return leftCategoryPriority - rightCategoryPriority;
    }

    if (left.difficulty !== right.difficulty) {
      return left.difficulty - right.difficulty;
    }

    return hashScore(`${seed}:${left.id}`) - hashScore(`${seed}:${right.id}`);
  })[0] ?? null;
}
