export const SUSTAINABILITY_CATEGORIES = [
  "water",
  "energy",
  "waste",
  "transport",
  "food",
  "consumption",
] as const;

export type SustainabilityCategory = (typeof SUSTAINABILITY_CATEGORIES)[number];

export const CATEGORY_LABELS_PT: Record<SustainabilityCategory, string> = {
  water: "Agua",
  energy: "Energia",
  waste: "Residuos",
  transport: "Transporte",
  food: "Alimentacao",
  consumption: "Consumo",
};

export const COST_LEVELS = ["free", "low", "medium", "high"] as const;

export type CostLevel = (typeof COST_LEVELS)[number];

export function isSustainabilityCategory(value: unknown): value is SustainabilityCategory {
  return typeof value === "string" && SUSTAINABILITY_CATEGORIES.includes(value as SustainabilityCategory);
}

export function isCostLevel(value: unknown): value is CostLevel {
  return typeof value === "string" && COST_LEVELS.includes(value as CostLevel);
}
