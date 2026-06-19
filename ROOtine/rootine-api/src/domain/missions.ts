import type { CostLevel, SustainabilityCategory } from "./categories";
import type { ImpactEstimate } from "./impact";

export type MissionType = "daily" | "specialized";

export interface MissionCandidate {
  title: string;
  description: string;
  category: SustainabilityCategory;
  environmental_goal: string;
  difficulty: number;
  effort_minutes: number;
  cost_level: CostLevel;
  used_fact_keys: string[];
  personalization_reason: string;
  expected_impact: ImpactEstimate;
  pattern_key?: string | null;
  mission_type?: MissionType;
  xp_reward?: number;
  ai_justification?: {
    reason?: string;
    [key: string]: unknown;
  };
}

export const MISSION_TYPES = ["daily", "specialized"] as const;

export function normalizeMissionText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getMissionText(
  candidate: Pick<MissionCandidate, "title" | "description" | "personalization_reason">,
) {
  return `${candidate.title} ${candidate.description} ${candidate.personalization_reason}`;
}
