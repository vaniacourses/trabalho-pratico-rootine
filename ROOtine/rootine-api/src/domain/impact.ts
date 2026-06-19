export const IMPACT_METRIC_KEYS = ["water_l", "co2_kg", "waste_g", "energy_kwh"] as const;

export type ImpactMetricKey = (typeof IMPACT_METRIC_KEYS)[number];

export interface ImpactRange {
  low: number;
  mid: number;
  high: number;
  confidence: number;
}

export type ImpactEstimate = Partial<Record<ImpactMetricKey, ImpactRange>>;

export const ZERO_IMPACT_ESTIMATE: Required<ImpactEstimate> = {
  water_l: { low: 0, mid: 0, high: 0, confidence: 0.2 },
  co2_kg: { low: 0, mid: 0, high: 0, confidence: 0.2 },
  waste_g: { low: 0, mid: 0, high: 0, confidence: 0.2 },
  energy_kwh: { low: 0, mid: 0, high: 0, confidence: 0.2 },
};

export function isImpactMetricKey(value: unknown): value is ImpactMetricKey {
  return typeof value === "string" && IMPACT_METRIC_KEYS.includes(value as ImpactMetricKey);
}

export function hasPositiveImpact(impact: ImpactEstimate) {
  return Object.values(impact).some((range) => {
    if (!range) return false;
    return Number(range.mid) > 0 || Number(range.high) > 0;
  });
}
