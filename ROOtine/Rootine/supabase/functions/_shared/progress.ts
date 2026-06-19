export const PROGRESS_SCHEMA_VERSION = 1;
export const PROGRESS_ALGORITHM_VERSION = "rootine_progress_v1";
export const IMPACT_MODEL_VERSION = "impact_model_v1";

export const XP_LEVEL_THRESHOLDS = [
  { level: 0, xp: 0, milestone: "Semente" },
  { level: 1, xp: 10, milestone: "Broto" },
  { level: 2, xp: 45, milestone: "Folhas novas" },
  { level: 3, xp: 100, milestone: "Muda firme" },
  { level: 4, xp: 180, milestone: "Primeiros galhos" },
  { level: 5, xp: 300, milestone: "Arvore jovem" },
  { level: 6, xp: 470, milestone: "Copa aberta" },
  { level: 7, xp: 700, milestone: "Habitat vivo" },
  { level: 8, xp: 1000, milestone: "Florescimento" },
  { level: 9, xp: 1400, milestone: "Frutos" },
  { level: 10, xp: 1900, milestone: "Ecossistema maduro" },
  { level: 11, xp: 2500, milestone: "Bosque" },
  { level: 12, xp: 3200, milestone: "Referencia sustentavel" },
] as const;

export const MISSION_XP_REWARDS: Record<number, number> = {
  1: 10,
  2: 16,
  3: 25,
  4: 40,
  5: 60,
};

export const IMPACT_METRIC_KEYS = ["water_l", "co2_kg", "waste_g", "energy_kwh"] as const;
export type ImpactMetricKey = typeof IMPACT_METRIC_KEYS[number];

const IMPACT_UNITS: Record<ImpactMetricKey, string> = {
  water_l: "l",
  co2_kg: "kg_co2e",
  waste_g: "g",
  energy_kwh: "kwh",
};

const DEFAULT_CATEGORY_IMPACT: Record<string, Partial<Record<ImpactMetricKey, number>>> = {
  water: { water_l: 6 },
  energy: { energy_kwh: 0.25, co2_kg: 0.08 },
  waste: { waste_g: 120 },
  transport: { co2_kg: 0.45 },
  food: { waste_g: 110, water_l: 4 },
  consumption: { waste_g: 90, co2_kg: 0.18 },
};

interface SupabaseLike {
  from: (table: string) => any;
}

export interface XpAwardResult {
  xpGranted: number;
  capped: boolean;
  alreadyAwarded: boolean;
  ledgerId: string | null;
  totalXp: number;
  level: number;
}

export interface ImpactLogResult {
  inserted: boolean;
  ledgerId: string | null;
  impact: Record<string, unknown>;
  impactModelKey: string;
  modelVersion: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))]
    : [];
}

function startOfUtcDay(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function startOfUtcWeek(date = new Date()) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diff = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - diff);
  return day.toISOString();
}

function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

export function getXpMinimumForLevel(level: number) {
  const normalizedLevel = Math.max(0, Math.floor(level));
  const known = XP_LEVEL_THRESHOLDS.find((entry) => entry.level === normalizedLevel);
  if (known) return known.xp;

  let xp = XP_LEVEL_THRESHOLDS[XP_LEVEL_THRESHOLDS.length - 1].xp;
  for (let currentLevel = 12; currentLevel < normalizedLevel; currentLevel += 1) {
    xp += Math.round(700 + (currentLevel - 12) * 180);
  }
  return xp;
}

export function getLevelFromXp(rawXp: unknown) {
  const xp = Math.max(0, Math.floor(numberValue(rawXp, 0)));
  let level = 0;

  while (getXpMinimumForLevel(level + 1) <= xp) {
    level += 1;
  }

  const xpMin = getXpMinimumForLevel(level);
  const xpNext = getXpMinimumForLevel(level + 1);
  const progress = Math.min(1, Math.max(0, (xp - xpMin) / Math.max(1, xpNext - xpMin)));
  const known = XP_LEVEL_THRESHOLDS.find((entry) => entry.level === level);

  return {
    xp,
    level,
    xpMin,
    xpNext,
    progress,
    milestone: known?.milestone ?? `Nivel ${level}`,
  };
}

export function getMissionXpReward(difficulty: unknown) {
  const normalized = Math.max(1, Math.min(5, Math.floor(numberValue(difficulty, 0))));
  return MISSION_XP_REWARDS[normalized] ?? 0;
}

export async function recalculateProfileXp(supabaseAdmin: SupabaseLike, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("xp_ledger")
    .select("xp_delta")
    .eq("user_id", userId);

  if (error) throw new Error(`Erro ao recalcular XP: ${error.message}`);

  const totalXp = (data ?? []).reduce(
    (sum: number, row: { xp_delta?: unknown }) => sum + Math.max(0, numberValue(row.xp_delta, 0)),
    0,
  );

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ xp: totalXp })
    .eq("id", userId);

  if (updateError) throw new Error(`Erro ao atualizar cache de XP: ${updateError.message}`);

  const level = getLevelFromXp(totalXp);
  console.log("[HABITAT] Cache de nivel recalculado.", {
    userId,
    total_xp: totalXp,
    level: level.level,
    progress: Number(level.progress.toFixed(4)),
    xp_min: level.xpMin,
    xp_next: level.xpNext,
  });

  return totalXp;
}

async function getExistingXpAward(supabaseAdmin: SupabaseLike, userId: string, idempotencyKey: string) {
  const { data, error } = await supabaseAdmin
    .from("xp_ledger")
    .select("id, xp_delta")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar XP existente: ${error.message}`);
  return data as { id: string; xp_delta: number } | null;
}

export async function awardXpLedger(
  supabaseAdmin: SupabaseLike,
  input: {
    userId: string;
    sourceType: string;
    sourceId?: string | null;
    reason: string;
    requestedXp: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<XpAwardResult> {
  const requestedXp = Math.max(0, Math.floor(input.requestedXp));
  if (requestedXp <= 0) {
    const totalXp = await recalculateProfileXp(supabaseAdmin, input.userId);
    const level = getLevelFromXp(totalXp);
    return { xpGranted: 0, capped: false, alreadyAwarded: false, ledgerId: null, totalXp, level: level.level };
  }

  const existing = await getExistingXpAward(supabaseAdmin, input.userId, input.idempotencyKey);
  if (existing) {
    const totalXp = await recalculateProfileXp(supabaseAdmin, input.userId);
    const level = getLevelFromXp(totalXp);
    console.log("[XP] Lancamento idempotente reutilizado.", {
      userId: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      idempotency_key: input.idempotencyKey,
      xp_delta: existing.xp_delta,
      total_xp: totalXp,
    });
    return {
      xpGranted: numberValue(existing.xp_delta, 0),
      capped: false,
      alreadyAwarded: true,
      ledgerId: existing.id,
      totalXp,
      level: level.level,
    };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("xp_ledger")
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      reason: input.reason,
      xp_delta: requestedXp,
      idempotency_key: input.idempotencyKey,
      metadata: {
        ...(input.metadata ?? {}),
        schema_version: PROGRESS_SCHEMA_VERSION,
        algorithm: PROGRESS_ALGORITHM_VERSION,
      },
    })
    .select("id, xp_delta")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const duplicate = await getExistingXpAward(supabaseAdmin, input.userId, input.idempotencyKey);
      const totalXp = await recalculateProfileXp(supabaseAdmin, input.userId);
      const level = getLevelFromXp(totalXp);
      return {
        xpGranted: numberValue(duplicate?.xp_delta, 0),
        capped: false,
        alreadyAwarded: true,
        ledgerId: duplicate?.id ?? null,
        totalXp,
        level: level.level,
      };
    }
    throw new Error(`Erro ao registrar XP: ${insertError.message}`);
  }

  const totalXp = await recalculateProfileXp(supabaseAdmin, input.userId);
  const level = getLevelFromXp(totalXp);
  console.log("[XP] Lancamento registrado.", {
    userId: input.userId,
    ledger_id: inserted.id,
    source_type: input.sourceType,
    source_id: input.sourceId ?? null,
    idempotency_key: input.idempotencyKey,
    xp_delta: requestedXp,
    total_xp: totalXp,
    level: level.level,
  });

  return {
    xpGranted: requestedXp,
    capped: false,
    alreadyAwarded: false,
    ledgerId: inserted.id,
    totalXp,
    level: level.level,
  };
}

export async function awardXpWithDailyCap(
  supabaseAdmin: SupabaseLike,
  input: {
    userId: string;
    sourceType: string;
    sourceId?: string | null;
    reason: string;
    requestedXp: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    dailyCap: number;
    dailyCapSourceTypes?: string[];
  },
): Promise<XpAwardResult> {
  const existing = await getExistingXpAward(supabaseAdmin, input.userId, input.idempotencyKey);
  if (existing) {
    const totalXp = await recalculateProfileXp(supabaseAdmin, input.userId);
    const level = getLevelFromXp(totalXp);
    return {
      xpGranted: numberValue(existing.xp_delta, 0),
      capped: false,
      alreadyAwarded: true,
      ledgerId: existing.id,
      totalXp,
      level: level.level,
    };
  }

  const requestedXp = Math.max(0, Math.floor(input.requestedXp));
  if (requestedXp <= 0) {
    const totalXp = await recalculateProfileXp(supabaseAdmin, input.userId);
    const level = getLevelFromXp(totalXp);
    return { xpGranted: 0, capped: false, alreadyAwarded: false, ledgerId: null, totalXp, level: level.level };
  }

  const { data: todayRows, error: todayError } = await supabaseAdmin
    .from("xp_ledger")
    .select("xp_delta")
    .eq("user_id", input.userId)
    .in("source_type", input.dailyCapSourceTypes ?? [input.sourceType])
    .gte("created_at", startOfUtcDay());

  if (todayError) throw new Error(`Erro ao consultar teto diario de XP: ${todayError.message}`);

  const currentDailyXp = (todayRows ?? []).reduce(
    (sum: number, row: { xp_delta?: unknown }) => sum + Math.max(0, numberValue(row.xp_delta, 0)),
    0,
  );
  const remaining = Math.max(0, input.dailyCap - currentDailyXp);
  const xpGranted = Math.min(requestedXp, remaining);

  if (xpGranted <= 0) {
    const totalXp = await recalculateProfileXp(supabaseAdmin, input.userId);
    const level = getLevelFromXp(totalXp);
    console.log("[XP] Teto diario aplicado.", {
      userId: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      idempotency_key: input.idempotencyKey,
      requested_xp: requestedXp,
      daily_cap: input.dailyCap,
      current_daily_xp: currentDailyXp,
      total_xp: totalXp,
    });
    return { xpGranted: 0, capped: true, alreadyAwarded: false, ledgerId: null, totalXp, level: level.level };
  }

  return awardXpLedger(supabaseAdmin, {
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    reason: input.reason,
    requestedXp: xpGranted,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      ...(input.metadata ?? {}),
      requested_xp: requestedXp,
      daily_cap: input.dailyCap,
      daily_cap_source_types: input.dailyCapSourceTypes ?? [input.sourceType],
      capped: xpGranted < requestedXp,
    },
  }).then((result) => ({
    ...result,
    capped: xpGranted < requestedXp,
  }));
}

function rangeFromMid(mid: number, confidence: number) {
  const safeMid = Math.max(0, mid);
  return {
    low: Number((safeMid * 0.35).toFixed(4)),
    mid: Number(safeMid.toFixed(4)),
    high: Number((safeMid * 1.8).toFixed(4)),
    confidence,
  };
}

export function canonicalImpactEstimate(
  rawImpact: unknown,
  category: unknown,
  difficulty: unknown,
) {
  const raw = asObject(rawImpact);
  const normalizedCategory = typeof category === "string" ? category : "consumption";
  const difficultyFactor = Math.max(0.75, Math.min(1.6, numberValue(difficulty, 1) / 2));
  const fallback = DEFAULT_CATEGORY_IMPACT[normalizedCategory] ?? DEFAULT_CATEGORY_IMPACT.consumption;
  const impact: Record<ImpactMetricKey, Record<string, unknown>> = {} as any;

  for (const metric of IMPACT_METRIC_KEYS) {
    const range = asObject(raw[metric]);
    const fallbackMid = numberValue(fallback[metric], 0) * difficultyFactor;
    const low = Math.max(0, numberValue(range.low, fallbackMid * 0.35));
    const mid = Math.max(0, numberValue(range.mid, fallbackMid));
    const high = Math.max(0, numberValue(range.high, Math.max(mid, fallbackMid * 1.8)));
    const confidence = Math.max(0, Math.min(1, numberValue(range.confidence, mid > 0 ? 0.38 : 0.2)));

    impact[metric] = {
      low,
      mid,
      high,
      unit: IMPACT_UNITS[metric],
      confidence,
      model_version: IMPACT_MODEL_VERSION,
    };
  }

  return impact;
}

export function aggregateImpactRows(rows: Array<{ impact?: unknown; logged_at?: string | null }>) {
  const empty = () => Object.fromEntries(IMPACT_METRIC_KEYS.map((key) => [key, 0])) as Record<ImpactMetricKey, number>;
  const totals = {
    week: empty(),
    month: empty(),
    total: empty(),
  };
  const weekStart = Date.parse(startOfUtcWeek());
  const monthStart = Date.parse(startOfUtcMonth());

  for (const row of rows) {
    const loggedAt = Date.parse(row.logged_at ?? "");
    const impact = asObject(row.impact);
    for (const metric of IMPACT_METRIC_KEYS) {
      const mid = numberValue(asObject(impact[metric]).mid, 0);
      totals.total[metric] += mid;
      if (Number.isFinite(loggedAt) && loggedAt >= monthStart) totals.month[metric] += mid;
      if (Number.isFinite(loggedAt) && loggedAt >= weekStart) totals.week[metric] += mid;
    }
  }

  for (const period of Object.keys(totals) as Array<keyof typeof totals>) {
    for (const metric of IMPACT_METRIC_KEYS) {
      totals[period][metric] = Number(totals[period][metric].toFixed(4));
    }
  }

  return totals;
}

export async function logMissionImpact(
  supabaseAdmin: SupabaseLike,
  input: {
    userId: string;
    mission: Record<string, unknown>;
  },
): Promise<ImpactLogResult> {
  const missionId = String(input.mission.id ?? "");
  if (!missionId) throw new Error("mission.id ausente para registrar impacto.");

  const idempotencyKey = `mission_impact:${missionId}`;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("impact_ledger")
    .select("id, impact, metadata, impact_model_key, model_version")
    .eq("user_id", input.userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) throw new Error(`Erro ao buscar impacto existente: ${existingError.message}`);

  const patternKey = typeof input.mission.pattern_key === "string" && input.mission.pattern_key.trim()
    ? input.mission.pattern_key.trim()
    : null;
  const category = typeof input.mission.category === "string" ? input.mission.category : "consumption";

  let impactModelKey = `${category}.default`;
  if (patternKey) {
    const { data: pattern, error: patternError } = await supabaseAdmin
      .from("mission_patterns")
      .select("key, impact_model_key")
      .eq("key", patternKey)
      .maybeSingle();

    if (patternError) throw new Error(`Erro ao resolver impact_model_key: ${patternError.message}`);
    impactModelKey = typeof pattern?.impact_model_key === "string" && pattern.impact_model_key.trim()
      ? pattern.impact_model_key.trim()
      : `${patternKey}.impact`;
  }

  if (existing) {
    console.log("[IMPACT] Impacto idempotente reutilizado.", {
      userId: input.userId,
      mission_id: missionId,
      ledger_id: existing.id,
      pattern_key: patternKey,
      impact_model_key: existing.impact_model_key ?? impactModelKey,
      model_version: existing.model_version ?? IMPACT_MODEL_VERSION,
      idempotency_key: idempotencyKey,
    });
    return {
      inserted: false,
      ledgerId: existing.id,
      impact: asObject(existing.impact),
      impactModelKey: String(existing.impact_model_key ?? impactModelKey),
      modelVersion: String(existing.model_version ?? IMPACT_MODEL_VERSION),
    };
  }

  const { data: existingMissionImpact, error: existingMissionImpactError } = await supabaseAdmin
    .from("impact_ledger")
    .select("id, impact, metadata, impact_model_key, model_version")
    .eq("mission_id", missionId)
    .maybeSingle();

  if (existingMissionImpactError) {
    throw new Error(`Erro ao buscar impacto existente por missão: ${existingMissionImpactError.message}`);
  }

  if (existingMissionImpact) {
    console.log("[IMPACT] Impacto de missão reutilizado.", {
      userId: input.userId,
      mission_id: missionId,
      ledger_id: existingMissionImpact.id,
      pattern_key: patternKey,
      impact_model_key: existingMissionImpact.impact_model_key ?? impactModelKey,
      model_version: existingMissionImpact.model_version ?? IMPACT_MODEL_VERSION,
      idempotency_key: idempotencyKey,
    });
    return {
      inserted: false,
      ledgerId: existingMissionImpact.id,
      impact: asObject(existingMissionImpact.impact),
      impactModelKey: String(existingMissionImpact.impact_model_key ?? impactModelKey),
      modelVersion: String(existingMissionImpact.model_version ?? IMPACT_MODEL_VERSION),
    };
  }

  const impact = canonicalImpactEstimate(
    input.mission.expected_impact,
    category,
    input.mission.difficulty,
  );
  const confidenceValues = IMPACT_METRIC_KEYS.map((metric) => numberValue(impact[metric].confidence, 0.2));
  const confidence = Number((
    confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(1, confidenceValues.length)
  ).toFixed(3));
  const loggedAt = typeof input.mission.completed_at === "string"
    ? input.mission.completed_at
    : new Date().toISOString();

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("impact_ledger")
    .insert({
      user_id: input.userId,
      mission_id: missionId,
      source_type: "mission_completed",
      impact,
      estimated: true,
      confidence,
      idempotency_key: idempotencyKey,
      logged_at: loggedAt,
      pattern_key: patternKey,
      impact_model_key: impactModelKey,
      model_version: IMPACT_MODEL_VERSION,
      metadata: {
        schema_version: PROGRESS_SCHEMA_VERSION,
        algorithm: PROGRESS_ALGORITHM_VERSION,
        category,
        units: IMPACT_UNITS,
        source: "mission_expected_impact",
      },
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return logMissionImpact(supabaseAdmin, input);
    }
    throw new Error(`Erro ao registrar impacto: ${insertError.message}`);
  }

  await supabaseAdmin
    .from("user_missions")
    .update({ impact_logged_at: loggedAt })
    .eq("id", missionId)
    .eq("user_id", input.userId);

  console.log("[IMPACT] Impacto registrado.", {
    userId: input.userId,
    mission_id: missionId,
    ledger_id: inserted.id,
    pattern_key: patternKey,
    impact_model_key: impactModelKey,
    model_version: IMPACT_MODEL_VERSION,
    idempotency_key: idempotencyKey,
    confidence,
  });

  return {
    inserted: true,
    ledgerId: inserted.id,
    impact,
    impactModelKey,
    modelVersion: IMPACT_MODEL_VERSION,
  };
}

async function achievementMetrics(supabaseAdmin: SupabaseLike, userId: string) {
  const [
    { data: missions, error: missionsError },
    { data: events, error: eventsError },
    { data: impacts, error: impactsError },
    { data: xpRows, error: xpError },
  ] = await Promise.all([
    supabaseAdmin
      .from("user_missions")
      .select("id, status, category, difficulty, completed_at")
      .eq("user_id", userId),
    supabaseAdmin
      .from("user_profile_events")
      .select("event_type, source, payload, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(1500),
    supabaseAdmin
      .from("impact_ledger")
      .select("impact, logged_at")
      .eq("user_id", userId),
    supabaseAdmin
      .from("xp_ledger")
      .select("xp_delta, source_type, created_at")
      .eq("user_id", userId),
  ]);

  if (missionsError) throw new Error(`Erro ao buscar metricas de missoes: ${missionsError.message}`);
  if (eventsError) throw new Error(`Erro ao buscar metricas de eventos: ${eventsError.message}`);
  if (impactsError) throw new Error(`Erro ao buscar metricas de impacto: ${impactsError.message}`);
  if (xpError) throw new Error(`Erro ao buscar metricas de XP: ${xpError.message}`);

  const completedMissions = (missions ?? []).filter((mission: any) => mission.status === "completed");
  const impactTotals = aggregateImpactRows((impacts ?? []) as any).total;
  const eventRows = (events ?? []) as Array<{ event_type?: string; source?: string; payload?: unknown; occurred_at?: string }>;
  const activeDays = new Set(
    eventRows
      .map((event) => typeof event.occurred_at === "string" ? event.occurred_at.slice(0, 10) : null)
      .filter((day): day is string => Boolean(day)),
  );
  const categories = new Set<string>();
  for (const mission of completedMissions as any[]) {
    if (typeof mission.category === "string") categories.add(mission.category);
  }
  for (const event of eventRows) {
    const category = asObject(event.payload).category;
    if (typeof category === "string") categories.add(category);
  }

  const totalXp = (xpRows ?? []).reduce(
    (sum: number, row: { xp_delta?: unknown }) => sum + Math.max(0, numberValue(row.xp_delta, 0)),
    0,
  );
  const level = getLevelFromXp(totalXp);
  const quizCorrectCount = eventRows.filter((event) =>
    event.event_type === "QUIZ_COMPLETED" && asObject(event.payload).correct === true
  ).length;
  const adventureBatchCount = eventRows.filter((event) => event.event_type === "BATCH_COMPLETED").length;
  const editCount = eventRows.filter((event) => event.event_type === "FEEDBACK_SENT" && event.source === "mission_edit").length;
  const feedbackCount = eventRows.filter((event) => event.event_type === "FEEDBACK_SENT").length;
  const onboardingCount = eventRows.filter((event) => event.event_type === "ONBOARDING_COMPLETED").length;

  return {
    completedMissions: completedMissions.length,
    missionDifficulty3: completedMissions.filter((mission: any) => numberValue(mission.difficulty, 0) >= 3).length,
    missionDifficulty4: completedMissions.filter((mission: any) => numberValue(mission.difficulty, 0) >= 4).length,
    activeDays: activeDays.size,
    categoriesTouched: categories.size,
    adventureBatchCount,
    editCount,
    feedbackCount,
    onboardingCount,
    quizCorrectCount,
    impactTotals,
    totalXp,
    level: level.level,
  };
}

function qualifiesForAchievement(key: string, metrics: Awaited<ReturnType<typeof achievementMetrics>>) {
  switch (key) {
    case "onboarding_complete":
      return metrics.onboardingCount >= 1;
    case "first_mission_completed":
      return metrics.completedMissions >= 1;
    case "three_missions_completed":
      return metrics.completedMissions >= 3;
    case "five_missions_completed":
      return metrics.completedMissions >= 5;
    case "twenty_missions_completed":
      return metrics.completedMissions >= 20;
    case "first_adventure_batch":
      return metrics.adventureBatchCount >= 1;
    case "seven_active_days":
      return metrics.activeDays >= 7;
    case "four_categories_touched":
      return metrics.categoriesTouched >= 4;
    case "first_mission_edit":
      return metrics.editCount >= 1;
    case "first_feedback":
      return metrics.feedbackCount >= 1;
    case "quiz_streak_3":
      return metrics.quizCorrectCount >= 3;
    case "mission_difficulty_3":
      return metrics.missionDifficulty3 >= 1;
    case "mission_difficulty_4":
      return metrics.missionDifficulty4 >= 1;
    case "impact_water":
      return metrics.impactTotals.water_l > 0;
    case "water_saver_seed":
      return false;
    case "impact_waste":
      return metrics.impactTotals.waste_g > 0;
    case "impact_co2_energy":
      return metrics.impactTotals.co2_kg > 0 || metrics.impactTotals.energy_kwh > 0;
    case "habitat_level_3":
      return metrics.level >= 3;
    default:
      return false;
  }
}

export async function unlockEligibleAchievements(
  supabaseAdmin: SupabaseLike,
  userId: string,
  source: string,
) {
  const [{ data: definitions, error: definitionsError }, { data: existingRows, error: existingError }] =
    await Promise.all([
      supabaseAdmin
        .from("achievement_definitions")
        .select("key, title, xp_reward, criteria, active")
        .eq("active", true),
      supabaseAdmin
        .from("user_achievements")
        .select("achievement_key")
        .eq("user_id", userId),
    ]);

  if (definitionsError) throw new Error(`Erro ao buscar conquistas: ${definitionsError.message}`);
  if (existingError) throw new Error(`Erro ao buscar conquistas do usuario: ${existingError.message}`);

  const existing = new Set((existingRows ?? []).map((row: { achievement_key: string }) => row.achievement_key));
  const metrics = await achievementMetrics(supabaseAdmin, userId);
  const unlocked: string[] = [];
  let unlockedXp = 0;

  for (const definition of definitions ?? []) {
    if (existing.has(definition.key) || !qualifiesForAchievement(definition.key, metrics)) continue;

    const xp = await awardXpLedger(supabaseAdmin, {
      userId,
      sourceType: "achievement",
      sourceId: null,
      reason: `Conquista: ${definition.title}`,
      requestedXp: Math.max(0, numberValue(definition.xp_reward, 0)),
      idempotencyKey: `achievement:${definition.key}`,
      metadata: {
        achievement_key: definition.key,
        criteria: asObject(definition.criteria),
        trigger_source: source,
      },
    });

    const { error: insertError } = await supabaseAdmin
      .from("user_achievements")
      .insert({
        user_id: userId,
        achievement_key: definition.key,
        xp_ledger_id: xp.ledgerId,
        metadata: {
          schema_version: PROGRESS_SCHEMA_VERSION,
          algorithm: PROGRESS_ALGORITHM_VERSION,
          trigger_source: source,
          metrics_snapshot: metrics,
        },
      });

    if (insertError && insertError.code !== "23505") {
      throw new Error(`Erro ao desbloquear conquista ${definition.key}: ${insertError.message}`);
    }

    if (!insertError) {
      unlocked.push(definition.key);
      unlockedXp += xp.xpGranted;
      existing.add(definition.key);
      console.log("[XP] Conquista desbloqueada.", {
        userId,
        achievement_key: definition.key,
        xp_delta: xp.xpGranted,
        idempotency_key: `achievement:${definition.key}`,
        total_xp: xp.totalXp,
      });
    }
  }

  return { unlocked, unlocked_xp: unlockedXp, metrics };
}
