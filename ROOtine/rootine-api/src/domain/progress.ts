import { IMPACT_METRIC_KEYS, type ImpactMetricKey } from "./impact";

export const PROGRESS_SCHEMA_VERSION = 1;
export const PROGRESS_ALGORITHM_VERSION = "rootine_progress_v1";
export const IMPACT_MODEL_VERSION = "impact_model_v1";

export const IMPACT_UNITS: Record<ImpactMetricKey, string> = {
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

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function startOfUtcDay(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export function startOfUtcWeek(date = new Date()) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diff = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - diff);
  return day.toISOString();
}

export function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
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

export function canonicalImpactEstimate(rawImpact: unknown, category: unknown, difficulty: unknown) {
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
  const empty = () =>
    Object.fromEntries(IMPACT_METRIC_KEYS.map((key) => [key, 0])) as Record<ImpactMetricKey, number>;
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
