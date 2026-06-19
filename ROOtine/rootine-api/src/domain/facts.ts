import type { SustainabilityCategory } from "./categories";

export const PROFILE_FACT_TYPES = [
  "constraint",
  "hard_block",
  "deficit",
  "capability",
  "preference",
  "interest",
  "habit",
  "context",
  "goal",
  "risk",
] as const;

export type ProfileFactType = (typeof PROFILE_FACT_TYPES)[number];

export interface ProfileFact {
  fact_key: string;
  fact_type: ProfileFactType;
  category?: SustainabilityCategory | null;
  value: unknown;
  confidence: number;
  source_event_ids?: string[];
  active?: boolean;
}

export function isProfileFactType(value: unknown): value is ProfileFactType {
  return typeof value === "string" && PROFILE_FACT_TYPES.includes(value as ProfileFactType);
}
