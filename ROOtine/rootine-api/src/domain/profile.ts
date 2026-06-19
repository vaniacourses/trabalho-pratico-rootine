import type { SustainabilityCategory } from "./categories";

export const FEEDBACK_KINDS = [
  "constraint",
  "hard_block",
  "preference",
  "deficit",
  "mission_adjustment",
  "unclear",
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_SEVERITIES = ["low", "medium", "high"] as const;

export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export interface FeedbackClassification {
  kind: FeedbackKind;
  summary: string;
  severity?: FeedbackSeverity;
  category?: SustainabilityCategory;
  fact_key?: string;
  creates_hard_block?: boolean;
  raw_text_summary?: string;
}

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && FEEDBACK_KINDS.includes(value as FeedbackKind);
}

export function isFeedbackSeverity(value: unknown): value is FeedbackSeverity {
  return typeof value === "string" && FEEDBACK_SEVERITIES.includes(value as FeedbackSeverity);
}
