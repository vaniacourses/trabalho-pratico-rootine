import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADVENTURE_ALGORITHM_VERSION,
  ADVENTURE_CATEGORIES,
  buildFlashcardFact,
  buildQuizFact,
  type AdventureCategory,
  type FlashcardCatalogRow,
  type QuizQuestionRow,
} from "../_shared/adventure.ts";
import {
  corsHeaders,
  createSupabaseAdmin,
  getErrorStatus,
  jsonResponse,
  requireUserIdFromJwt,
} from "../_shared/supabase-admin.ts";
import {
  awardXpLedger,
  getMissionXpReward,
  logMissionImpact,
  unlockEligibleAchievements,
} from "../_shared/progress.ts";

const BRAIN_SCHEMA_VERSION = 1;
const BRAIN_ALGORITHM_VERSION = "deterministic_brain_v1";

type EventType = "BATCH_COMPLETED" | "MISSION_ACTION" | "FEEDBACK_SENT" | "QUIZ_COMPLETED";
type ProfileEventType = EventType | "FLASHCARD_ANSWERED";
type MissionAction = "COMPLETED" | "REFUSED" | "FAILED";
type NormalizedMissionAction = "completed" | "refused" | "failed";

interface BrainSyncPayload {
  userId: string;
  event_type: EventType;
  batchId?: string;
  missionId?: string;
  missionAction?: MissionAction | NormalizedMissionAction;
  feedbackText?: string;
  quizId?: string;
  quizAnswerId?: string;
}

interface ProfileFactRow {
  id?: string;
  user_id?: string;
  fact_key: string;
  fact_type: string;
  category: AdventureCategory | null;
  value: Record<string, unknown>;
  confidence: number;
  source_event_ids: string[];
  active: boolean;
  derived_by: string;
  evidence_count: number;
  first_seen_at?: string;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface ProfileEventRow {
  id: string;
  event_type: string;
  source_table?: string | null;
  source_id?: string | null;
  payload?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  occurred_at?: string | null;
}

interface ProcessResult {
  eventId?: string;
  factsWritten: number;
  factsSkipped: number;
  notes: string[];
  xp?: unknown;
  impact?: unknown;
}

function emptyAffinities() {
  return Object.fromEntries(ADVENTURE_CATEGORIES.map((category) => [category, 0])) as Record<
    AdventureCategory,
    number
  >;
}

function isCategory(value: unknown): value is AdventureCategory {
  return typeof value === "string" &&
    ADVENTURE_CATEGORIES.includes(value as AdventureCategory);
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

function clamp(value: number, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeMissionAction(value: unknown): NormalizedMissionAction {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw === "completed") return "completed";
  if (raw === "failed") return "failed";
  return "refused";
}

function unique(values: string[], max = 24) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

function safeFactLabel(fact: ProfileFactRow) {
  const value = asObject(fact.value);
  const signalKey = typeof value.signal_key === "string" ? value.signal_key : fact.fact_key;
  const category = fact.category ? `/${fact.category}` : "";

  if (fact.fact_key.startsWith("onboarding.")) {
    const label = typeof value.label === "string" ? value.label : signalKey;
    return `Onboarding${category}: ${label}`;
  }

  if (fact.fact_key.startsWith("adventure.flashcard.")) {
    if (fact.fact_type === "deficit" || fact.fact_type === "constraint") {
      return `Aventura${category}: precisa desenvolver ${signalKey}`;
    }
    return `Aventura${category}: sinal positivo em ${signalKey}`;
  }

  if (fact.fact_key.startsWith("adventure.quiz.")) {
    return fact.fact_type === "deficit"
      ? `Quiz${category}: revisar conceito`
      : `Quiz${category}: conhecimento demonstrado`;
  }

  if (fact.fact_key.startsWith("trail.mission.")) {
    const action = typeof value.action === "string" ? value.action : "mission";
    if (action === "failed") return `Trilha${category}: reduzir intensidade antes de repetir`;
    if (action === "refused") return `Trilha${category}: reduzir prioridade do pattern`;
    return `Trilha${category}: missão concluída`;
  }

  return `${fact.fact_type}${category}: ${signalKey}`;
}

function affinityDeltaForFact(fact: ProfileFactRow) {
  const value = asObject(fact.value);
  const effect = asObject(value.effect);
  const explicitEffectDelta = effect.affinity_delta;
  const explicitPriorityDelta = value.priority_delta;
  let delta = 0;

  if (typeof explicitEffectDelta === "number") delta += explicitEffectDelta;
  if (typeof explicitPriorityDelta === "number") delta += explicitPriorityDelta;

  if (delta === 0) {
    switch (fact.fact_type) {
      case "habit":
      case "interest":
      case "capability":
      case "goal":
        delta = 0.08;
        break;
      case "preference":
        delta = 0.05;
        break;
      case "deficit":
        delta = -0.04;
        break;
      case "constraint":
        delta = -0.03;
        break;
      case "hard_block":
        delta = -0.12;
        break;
      case "risk":
        delta = -0.06;
        break;
      default:
        delta = 0;
    }
  }

  return delta * clamp(numberValue(fact.confidence, 0.5), 0.1, 1);
}

function buildMissionFact(
  mission: Record<string, unknown>,
  action: NormalizedMissionAction,
  eventId: string,
  occurredAt: string,
): ProfileFactRow {
  const aiJustification = asObject(mission.ai_justification);
  const fallbackCategory = aiJustification.category;
  const category = isCategory(mission.category)
    ? mission.category
    : isCategory(fallbackCategory)
      ? fallbackCategory
      : null;
  const patternKey = typeof mission.pattern_key === "string" && mission.pattern_key.trim()
    ? mission.pattern_key.trim()
    : `legacy.${mission.id}`;
  const difficulty = numberValue(mission.difficulty, 1);
  const effortMinutes = numberValue(mission.effort_minutes, 0);
  const usedFactKeys = stringArray(mission.used_fact_keys);
  const missionType = typeof mission.mission_type === "string" ? mission.mission_type : "daily";

  const actionConfig = {
    completed: {
      suffix: "completed",
      factType: "habit",
      confidence: 0.74,
      priorityDelta: 0.08,
      recommendation: "can_repeat_or_increase_depth_slightly",
    },
    refused: {
      suffix: "priority",
      factType: "preference",
      confidence: 0.48,
      priorityDelta: -0.1,
      recommendation: "reduce_pattern_priority_without_hard_block",
    },
    failed: {
      suffix: "difficulty_fit",
      factType: "constraint",
      confidence: 0.55,
      priorityDelta: -0.06,
      recommendation: "lower_difficulty_or_effort_before_blocking_category",
    },
  }[action];

  return {
    fact_key: `trail.mission.${patternKey}.${actionConfig.suffix}`,
    fact_type: actionConfig.factType,
    category,
    value: {
      action,
      mission_id: mission.id,
      mission_type: missionType,
      pattern_key: patternKey.startsWith("legacy.") ? null : patternKey,
      category,
      difficulty,
      effort_minutes: effortMinutes,
      cost_level: typeof mission.cost_level === "string" ? mission.cost_level : null,
      environmental_goal: typeof mission.environmental_goal === "string"
        ? mission.environmental_goal
        : null,
      used_fact_keys: usedFactKeys,
      priority_delta: actionConfig.priorityDelta,
      hard_block: false,
      recommendation: actionConfig.recommendation,
      source: "mission_action",
      algorithm: BRAIN_ALGORITHM_VERSION,
    },
    confidence: actionConfig.confidence,
    source_event_ids: [eventId],
    active: true,
    derived_by: BRAIN_ALGORITHM_VERSION,
    evidence_count: 1,
    last_seen_at: occurredAt,
    updated_at: occurredAt,
  };
}

async function findReusableEvent(
  supabaseAdmin: any,
  input: {
    userId: string;
    eventType: ProfileEventType;
    sourceTable?: string | null;
    sourceId?: string | null;
    action?: NormalizedMissionAction;
  },
): Promise<ProfileEventRow | null> {
  let query = supabaseAdmin
    .from("user_profile_events")
    .select("id, event_type, source_table, source_id, payload, metadata, occurred_at")
    .eq("user_id", input.userId)
    .eq("event_type", input.eventType)
    .order("occurred_at", { ascending: false })
    .limit(25);

  if (input.sourceTable) query = query.eq("source_table", input.sourceTable);
  if (input.sourceId) query = query.eq("source_id", input.sourceId);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar evento existente: ${error.message}`);

  const rows = (data ?? []) as ProfileEventRow[];
  if (!input.action) return rows[0] ?? null;
  return rows.find((row) => asObject(row.payload).action === input.action) ?? null;
}

async function insertProfileEvent(
  supabaseAdmin: any,
  input: {
    userId: string;
    eventType: ProfileEventType;
    source: string;
    sourceTable?: string | null;
    sourceId?: string | null;
    payload: Record<string, unknown>;
    occurredAt?: string;
    action?: NormalizedMissionAction;
    reuseExisting?: boolean;
  },
): Promise<ProfileEventRow> {
  const reusable = input.reuseExisting === false
    ? null
    : await findReusableEvent(supabaseAdmin, {
      userId: input.userId,
      eventType: input.eventType,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      action: input.action,
    });

  if (reusable) return reusable;

  const eventId = crypto.randomUUID();
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const payload = {
    ...input.payload,
    schema_version: BRAIN_SCHEMA_VERSION,
  };

  const { error } = await supabaseAdmin
    .from("user_profile_events")
    .insert({
      id: eventId,
      user_id: input.userId,
      event_type: input.eventType,
      source: input.source,
      source_table: input.sourceTable ?? null,
      source_id: input.sourceId ?? null,
      payload,
      metadata: {
        schema_version: BRAIN_SCHEMA_VERSION,
        algorithm: BRAIN_ALGORITHM_VERSION,
        sensitive_text_logged: false,
      },
      schema_version: BRAIN_SCHEMA_VERSION,
      occurred_at: occurredAt,
    });

  if (error) throw new Error(`Erro ao gravar evento ${input.eventType}: ${error.message}`);

  return {
    id: eventId,
    event_type: input.eventType,
    source_table: input.sourceTable,
    source_id: input.sourceId,
    payload,
    metadata: { algorithm: BRAIN_ALGORITHM_VERSION },
    occurred_at: occurredAt,
  };
}

async function upsertFact(supabaseAdmin: any, userId: string, fact: ProfileFactRow) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_profile_facts")
    .select("source_event_ids, evidence_count, first_seen_at")
    .eq("user_id", userId)
    .eq("fact_key", fact.fact_key)
    .maybeSingle();

  if (existingError) throw new Error(`Erro ao buscar fato existente: ${existingError.message}`);

  const existingEvents = stringArray(existing?.source_event_ids);
  const sourceEventIds = unique([...existingEvents, ...fact.source_event_ids], 50);
  const factPayload = {
    ...fact,
    user_id: userId,
    source_event_ids: sourceEventIds,
    evidence_count: Math.max(numberValue(existing?.evidence_count, 0), sourceEventIds.length, 1),
    last_seen_at: fact.last_seen_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing?.first_seen_at) {
    delete (factPayload as any).first_seen_at;
  }

  const { error } = await supabaseAdmin
    .from("user_profile_facts")
    .upsert(factPayload, { onConflict: "user_id,fact_key" });

  if (error) throw new Error(`Erro ao gravar fato ${fact.fact_key}: ${error.message}`);
}

async function ensureFlashcardAnswerEvent(
  supabaseAdmin: any,
  userId: string,
  answer: Record<string, unknown>,
  flashcard: FlashcardCatalogRow,
): Promise<ProfileEventRow> {
  const existing = await findReusableEvent(supabaseAdmin, {
    userId,
    eventType: "FLASHCARD_ANSWERED",
    sourceTable: "user_flashcards_answers",
    sourceId: String(answer.id),
  });

  if (existing) return existing;

  return insertProfileEvent(supabaseAdmin, {
    userId,
    eventType: "FLASHCARD_ANSWERED",
    source: "brain_replay",
    sourceTable: "user_flashcards_answers",
    sourceId: String(answer.id),
    occurredAt: typeof answer.answered_at === "string" ? answer.answered_at : undefined,
    payload: {
      answer: answer.answer,
      flashcard_id: answer.flashcard_id,
      daily_batch: answer.daily_batch,
      category: flashcard.category,
      signal_key: flashcard.signal_key,
      signal_type: flashcard.signal_type,
      difficulty: flashcard.difficulty,
      replayed_by: BRAIN_ALGORITHM_VERSION,
    },
  });
}

async function processBatchCompleted(
  supabaseAdmin: any,
  userId: string,
  batchId: string | undefined,
): Promise<ProcessResult> {
  if (!batchId) throw new Error("batchId é obrigatório para BATCH_COMPLETED.");

  const { data: answers, error: answersError } = await supabaseAdmin
    .from("user_flashcards_answers")
    .select(`
      id,
      user_id,
      daily_batch,
      flashcard_id,
      answer,
      answered_at,
      flashcards(
        id,
        question,
        category,
        signal_key,
        signal_type,
        true_effect,
        false_effect,
        skip_effect,
        difficulty,
        weight
      )
    `)
    .eq("daily_batch", batchId)
    .eq("user_id", userId);

  if (answersError) throw new Error(`Erro ao buscar respostas do lote: ${answersError.message}`);

  const answered = (answers ?? []).filter((row: any) => row.answered_at !== null);
  const answeredCount = answered.filter((row: any) => row.answer !== null).length;
  const skippedCount = answered.filter((row: any) => row.answer === null).length;
  const pendingCount = (answers ?? []).filter((row: any) => row.answered_at === null).length;

  const batchEvent = await insertProfileEvent(supabaseAdmin, {
    userId,
    eventType: "BATCH_COMPLETED",
    source: "brain_replay",
    sourceTable: "user_daily_flashcards",
    sourceId: batchId,
    payload: {
      batch_id: batchId,
      answered_count: answeredCount,
      skipped_count: skippedCount,
      pending_count: pendingCount,
      total_count: answers?.length ?? 0,
    },
  });

  let factsWritten = 0;
  let factsSkipped = 0;

  for (const answer of answered) {
    if (answer.answer === null) {
      factsSkipped += 1;
      continue;
    }

    const flashcard = answer.flashcards as FlashcardCatalogRow | null;
    if (!flashcard || !isCategory(flashcard.category)) {
      factsSkipped += 1;
      continue;
    }

    const answerEvent = await ensureFlashcardAnswerEvent(supabaseAdmin, userId, answer, flashcard);
    const fact = buildFlashcardFact(flashcard, Boolean(answer.answer), answerEvent.id);
    if (!fact) {
      factsSkipped += 1;
      continue;
    }

    await upsertFact(supabaseAdmin, userId, {
      ...(fact as ProfileFactRow),
      last_seen_at: answerEvent.occurred_at ?? new Date().toISOString(),
    });
    factsWritten += 1;
  }

  return {
    eventId: batchEvent.id,
    factsWritten,
    factsSkipped,
    notes: [`answers:${answeredCount}`, `skips:${skippedCount}`],
  };
}

async function processQuizCompleted(
  supabaseAdmin: any,
  userId: string,
  quizId: string | undefined,
  quizAnswerId: string | undefined,
): Promise<ProcessResult> {
  let query = supabaseAdmin
    .from("user_quiz_answers")
    .select("id, user_id, quiz_id, quiz_question_id, selected_option, correct, answered_at")
    .eq("user_id", userId)
    .order("answered_at", { ascending: false })
    .limit(1);

  if (quizAnswerId) query = query.eq("id", quizAnswerId);
  else if (quizId) query = query.eq("quiz_id", quizId);
  else throw new Error("quizId ou quizAnswerId é obrigatório para QUIZ_COMPLETED.");

  const { data: answerRows, error: answerError } = await query;
  if (answerError) throw new Error(`Erro ao buscar resposta do quiz: ${answerError.message}`);

  const answer = answerRows?.[0];
  if (!answer) return { factsWritten: 0, factsSkipped: 1, notes: ["quiz_answer_not_found"] };

  if (!answer.quiz_question_id) {
    const event = await insertProfileEvent(supabaseAdmin, {
      userId,
      eventType: "QUIZ_COMPLETED",
      source: "brain_replay",
      sourceTable: "user_quiz_answers",
      sourceId: answer.id,
      occurredAt: answer.answered_at,
      payload: {
        quiz_id: answer.quiz_id,
        selected_option: answer.selected_option,
        correct: answer.correct,
        legacy_quiz_without_question_id: true,
      },
    });

    return { eventId: event.id, factsWritten: 0, factsSkipped: 1, notes: ["legacy_quiz"] };
  }

  const { data: quizQuestion, error: questionError } = await supabaseAdmin
    .from("quiz_questions")
    .select("id, category, question, options, correct_option, explanation, difficulty, signal_key, metadata")
    .eq("id", answer.quiz_question_id)
    .maybeSingle();

  if (questionError) throw new Error(`Erro ao buscar quiz_question: ${questionError.message}`);
  if (!quizQuestion || !isCategory(quizQuestion.category)) {
    return { factsWritten: 0, factsSkipped: 1, notes: ["quiz_question_not_found"] };
  }

  const event = await insertProfileEvent(supabaseAdmin, {
    userId,
    eventType: "QUIZ_COMPLETED",
    source: "brain_replay",
    sourceTable: "user_quiz_answers",
    sourceId: answer.id,
    occurredAt: answer.answered_at,
    payload: {
      quiz_id: answer.quiz_id,
      quiz_question_id: answer.quiz_question_id,
      selected_option: answer.selected_option,
      correct: Boolean(answer.correct),
      category: quizQuestion.category,
      difficulty: quizQuestion.difficulty,
      signal_key: quizQuestion.signal_key,
    },
  });

  const fact = buildQuizFact(
    quizQuestion as QuizQuestionRow,
    Boolean(answer.correct),
    answer.selected_option,
    event.id,
  );

  await upsertFact(supabaseAdmin, userId, {
    ...(fact as ProfileFactRow),
    last_seen_at: event.occurred_at ?? new Date().toISOString(),
  });

  return {
    eventId: event.id,
    factsWritten: 1,
    factsSkipped: 0,
    notes: [`correct:${Boolean(answer.correct)}`],
  };
}

async function processMissionAction(
  supabaseAdmin: any,
  userId: string,
  missionId: string | undefined,
  missionAction: unknown,
): Promise<ProcessResult> {
  if (!missionId) throw new Error("missionId é obrigatório para MISSION_ACTION.");

  const { data: mission, error: missionError } = await supabaseAdmin
    .from("user_missions")
    .select(`
      id,
      status,
      mission_type,
      category,
      environmental_goal,
      difficulty,
      effort_minutes,
      cost_level,
      xp_reward,
      used_fact_keys,
      personalization_reason,
      expected_impact,
      pattern_key,
      ai_justification,
      created_at,
      completed_at,
      expires_at
    `)
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (missionError) throw new Error(`Erro ao buscar missão: ${missionError.message}`);
  if (!mission) throw new Error("Missão não encontrada para o usuário.");

  const action = normalizeMissionAction(missionAction ?? mission.status);
  const actionAppliedAt = new Date().toISOString();

  if (action === "completed" && mission.status === "active") {
    const { error: updateMissionError } = await supabaseAdmin
      .from("user_missions")
      .update({ status: "completed", completed_at: actionAppliedAt })
      .eq("id", missionId)
      .eq("user_id", userId)
      .eq("status", "active");

    if (updateMissionError) {
      throw new Error(`Erro ao concluir missão: ${updateMissionError.message}`);
    }

    mission.status = "completed";
    mission.completed_at = actionAppliedAt;
  }

  const occurredAt = action === "completed" && mission.completed_at
    ? mission.completed_at
    : actionAppliedAt;

  const event = await insertProfileEvent(supabaseAdmin, {
    userId,
    eventType: "MISSION_ACTION",
    source: "trail",
    sourceTable: "user_missions",
    sourceId: missionId,
    action,
    occurredAt,
    payload: {
      action,
      mission_id: missionId,
      status: mission.status,
      mission_type: mission.mission_type ?? "daily",
      category: mission.category ?? asObject(mission.ai_justification).category ?? null,
      difficulty: mission.difficulty ?? null,
      effort_minutes: mission.effort_minutes ?? null,
      cost_level: mission.cost_level ?? null,
      pattern_key: mission.pattern_key ?? null,
      used_fact_keys: stringArray(mission.used_fact_keys),
      environmental_goal: mission.environmental_goal ?? null,
      expected_impact_present: Boolean(mission.expected_impact),
    },
  });

  const fact = buildMissionFact(mission, action, event.id, occurredAt);
  await upsertFact(supabaseAdmin, userId, fact);

  let xp: unknown = null;
  let impact: unknown = null;
  if (action === "completed") {
    const xpReward = getMissionXpReward(mission.difficulty);
    xp = await awardXpLedger(supabaseAdmin, {
      userId,
      sourceType: "mission_completed",
      sourceId: missionId,
      reason: `Missao concluida dificuldade ${numberValue(mission.difficulty, 1)}`,
      requestedXp: xpReward,
      idempotencyKey: `mission_completed:${missionId}`,
      metadata: {
        mission_type: mission.mission_type ?? "daily",
        category: mission.category ?? null,
        difficulty: mission.difficulty ?? null,
        pattern_key: mission.pattern_key ?? null,
      },
    });
    impact = await logMissionImpact(supabaseAdmin, { userId, mission });
  }

  return {
    eventId: event.id,
    factsWritten: 1,
    factsSkipped: 0,
    notes: [
      `action:${action}`,
      `hard_block:false`,
      action === "completed" ? "xp_checked:true" : "xp_checked:false",
      action === "completed" ? "impact_checked:true" : "impact_checked:false",
    ],
    xp,
    impact,
  };
}

async function processFeedbackSent(
  supabaseAdmin: any,
  userId: string,
  missionId: string | undefined,
  feedbackText: string | undefined,
): Promise<ProcessResult> {
  if (!feedbackText && !missionId) {
    throw new Error("feedbackText ou missionId é obrigatório para FEEDBACK_SENT.");
  }

  const event = await insertProfileEvent(supabaseAdmin, {
    userId,
    eventType: "FEEDBACK_SENT",
    source: "trail",
    sourceTable: missionId ? "user_missions" : null,
    sourceId: missionId ?? null,
    payload: {
      mission_id: missionId ?? null,
      feedback_text: feedbackText ?? null,
      feedback_length: feedbackText ? feedbackText.length : 0,
      classification_status: "raw_only",
      creates_structured_fact: false,
    },
    reuseExisting: false,
  });

  return {
    eventId: event.id,
    factsWritten: 0,
    factsSkipped: 0,
    notes: ["raw_feedback_only"],
  };
}

async function fetchProfileFacts(supabaseAdmin: any, userId: string): Promise<ProfileFactRow[]> {
  const { data, error } = await supabaseAdmin
    .from("user_profile_facts")
    .select("fact_key, fact_type, category, value, confidence, source_event_ids, active, derived_by, evidence_count, first_seen_at, last_seen_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`Erro ao buscar fatos do perfil: ${error.message}`);
  return (data ?? []) as ProfileFactRow[];
}

async function fetchProfileEvents(supabaseAdmin: any, userId: string): Promise<ProfileEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from("user_profile_events")
    .select("id, event_type, source_table, source_id, payload, metadata, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(150);

  if (error) throw new Error(`Erro ao buscar eventos do perfil: ${error.message}`);
  return (data ?? []) as ProfileEventRow[];
}

function buildLearnedPreferencesCache(facts: ProfileFactRow[], events: ProfileEventRow[], generatedAt: string) {
  const interests: string[] = [];
  const hardBlocks: string[] = [];
  const deficits: string[] = [];
  const evolutionTags: string[] = ["brain_v1"];
  const hardBlockFactKeys: string[] = [];
  const constraintFactKeys: string[] = [];

  for (const fact of facts) {
    const label = safeFactLabel(fact);
    const isStrongConstraint =
      (fact.fact_type === "constraint" || fact.fact_type === "risk") &&
      fact.fact_key.startsWith("onboarding.") &&
      numberValue(fact.confidence, 0) >= 0.9;

    if (
      fact.fact_type === "habit" ||
      fact.fact_type === "interest" ||
      fact.fact_type === "preference" ||
      fact.fact_type === "capability" ||
      fact.fact_type === "goal"
    ) {
      interests.push(label);
    }

    if (fact.fact_type === "hard_block" || isStrongConstraint) {
      hardBlocks.push(label);
      hardBlockFactKeys.push(fact.fact_key);
    } else if (fact.fact_type === "constraint" || fact.fact_type === "risk") {
      deficits.push(label);
      constraintFactKeys.push(fact.fact_key);
    }

    if (fact.fact_type === "deficit") deficits.push(label);

    if (fact.category) evolutionTags.push(`category_${fact.category}`);
    if (fact.fact_key.startsWith("adventure.")) evolutionTags.push("adventure_learning");
    if (fact.fact_key.startsWith("trail.mission.")) evolutionTags.push("trail_learning");
  }

  const eventTypeCounts = events.reduce((acc, event) => {
    acc[event.event_type] = (acc[event.event_type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    schema_version: BRAIN_SCHEMA_VERSION,
    generated_by: BRAIN_ALGORITHM_VERSION,
    generated_at: generatedAt,
    interests: unique(interests),
    hard_blocks: unique(hardBlocks),
    deficits: unique(deficits),
    evolution_tags: unique(evolutionTags, 32),
    ai_justification:
      "Sem IA: cache reconstruído deterministicamente a partir de user_profile_events e user_profile_facts.",
    cache_metadata: {
      source: "deterministic_profile_events",
      source_event_ids: events.slice(0, 25).map((event) => event.id),
      fact_count: facts.length,
      event_type_counts: eventTypeCounts,
      hard_block_fact_keys: hardBlockFactKeys.slice(0, 20),
      constraint_fact_keys: constraintFactKeys.slice(0, 20),
      facts_algorithm: BRAIN_ALGORITHM_VERSION,
      affinities_algorithm: BRAIN_ALGORITHM_VERSION,
    },
  };
}

function buildAffinitiesCache(facts: ProfileFactRow[]) {
  const affinities = emptyAffinities();

  for (const fact of facts) {
    if (!fact.category) continue;
    affinities[fact.category] = clamp(
      affinities[fact.category] + affinityDeltaForFact(fact),
    );
  }

  return Object.fromEntries(
    ADVENTURE_CATEGORIES.map((category) => [
      category,
      Math.round(affinities[category] * 1000) / 1000,
    ]),
  );
}

function buildSocioeconomicContextCache(
  current: unknown,
  facts: ProfileFactRow[],
  events: ProfileEventRow[],
  generatedAt: string,
) {
  const currentContext = asObject(current);
  const constraintFactKeys = facts
    .filter((fact) => fact.fact_type === "constraint" || fact.fact_type === "hard_block" || fact.fact_type === "risk")
    .map((fact) => fact.fact_key)
    .slice(0, 30);

  return {
    ...currentContext,
    schema_version: Math.max(
      numberValue(currentContext.schema_version, 0),
      BRAIN_SCHEMA_VERSION,
    ),
    generated_by: BRAIN_ALGORITHM_VERSION,
    generated_at: generatedAt,
    cache_metadata: {
      ...(asObject(currentContext.cache_metadata)),
      source: "deterministic_profile_events",
      generated_by: BRAIN_ALGORITHM_VERSION,
      generated_at: generatedAt,
      schema_version: BRAIN_SCHEMA_VERSION,
      fact_count: facts.length,
      event_count: events.length,
      constraint_fact_keys: constraintFactKeys,
    },
  };
}

async function rebuildProfileCaches(
  supabaseAdmin: any,
  userId: string,
  currentSocioeconomicContext: unknown,
) {
  const [facts, events] = await Promise.all([
    fetchProfileFacts(supabaseAdmin, userId),
    fetchProfileEvents(supabaseAdmin, userId),
  ]);
  const generatedAt = new Date().toISOString();
  const learnedPreferences = buildLearnedPreferencesCache(facts, events, generatedAt);
  const affinities = buildAffinitiesCache(facts);
  const socioeconomicContext = buildSocioeconomicContextCache(
    currentSocioeconomicContext,
    facts,
    events,
    generatedAt,
  );

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      learned_preferences: learnedPreferences,
      affinities,
      socioeconomic_context: socioeconomicContext,
    })
    .eq("id", userId);

  if (error) throw new Error(`Erro ao atualizar caches do perfil: ${error.message}`);

  return {
    factsCount: facts.length,
    eventsCount: events.length,
    affinities,
    learnedPreferences,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as BrainSyncPayload;
    const { userId, event_type } = body;

    if (!userId || !event_type) {
      throw new Error("Parâmetros obrigatórios: userId, event_type.");
    }

    await requireUserIdFromJwt(req, userId);
    const supabaseAdmin = createSupabaseAdmin();

    console.log("[BRAIN] Evento recebido para agregação determinística.", {
      userId,
      event_type,
      batchId: body.batchId,
      missionId: body.missionId,
      missionAction: body.missionAction,
      quizId: body.quizId,
      hasFeedbackText: Boolean(body.feedbackText),
      feedbackLength: body.feedbackText ? body.feedbackText.length : 0,
    });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("socioeconomic_context")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw new Error(`Erro ao buscar perfil: ${profileError.message}`);
    if (!profile) throw new Error("Perfil não encontrado.");

    let processResult: ProcessResult;
    if (event_type === "BATCH_COMPLETED") {
      processResult = await processBatchCompleted(supabaseAdmin, userId, body.batchId);
    } else if (event_type === "QUIZ_COMPLETED") {
      processResult = await processQuizCompleted(
        supabaseAdmin,
        userId,
        body.quizId,
        body.quizAnswerId,
      );
    } else if (event_type === "MISSION_ACTION") {
      processResult = await processMissionAction(
        supabaseAdmin,
        userId,
        body.missionId,
        body.missionAction,
      );
    } else if (event_type === "FEEDBACK_SENT") {
      processResult = await processFeedbackSent(
        supabaseAdmin,
        userId,
        body.missionId,
        body.feedbackText,
      );
    } else {
      throw new Error(`event_type não suportado: ${event_type}`);
    }

    const cacheResult = await rebuildProfileCaches(
      supabaseAdmin,
      userId,
      profile.socioeconomic_context,
    );
    const achievements = await unlockEligibleAchievements(supabaseAdmin, userId, "sync-user-brain");

    console.log("[BRAIN] Agregação concluída.", {
      userId,
      event_type,
      eventId: processResult.eventId,
      factsWritten: processResult.factsWritten,
      factsSkipped: processResult.factsSkipped,
      factsCount: cacheResult.factsCount,
      eventsCount: cacheResult.eventsCount,
      achievementsUnlocked: achievements.unlocked.length,
      notes: processResult.notes,
    });

    return jsonResponse({
      success: true,
      event_type,
      event_id: processResult.eventId,
      facts_written: processResult.factsWritten,
      facts_skipped: processResult.factsSkipped,
      caches: {
        generated_by: BRAIN_ALGORITHM_VERSION,
        schema_version: BRAIN_SCHEMA_VERSION,
        facts_count: cacheResult.factsCount,
        events_count: cacheResult.eventsCount,
      },
      xp: processResult.xp ?? null,
      impact: processResult.impact ?? null,
      achievements,
      notes: processResult.notes,
    });
  } catch (error: any) {
    console.error("[BRAIN] Erro:", error.message);
    return jsonResponse({ error: error.message }, getErrorStatus(error));
  }
});
