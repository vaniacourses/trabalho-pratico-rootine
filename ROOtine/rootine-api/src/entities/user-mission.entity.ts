import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

export type MissionStatus = "pending" | "active" | "completed" | "expired" | "refused" | "failed";
export type MissionTypeEnum = "daily" | "specialized";

@Entity({ tableName: "user_missions" })
export class UserMission {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  title!: string;

  @Property({ type: "string" })
  description!: string;

  @Property({ type: "json", nullable: true })
  aiJustification?: Record<string, unknown> | null;

  @Property({ type: "json", nullable: true })
  feedbackNotes?: Record<string, unknown> | null;

  @Property({ columnType: "mission_status_enum" })
  status: MissionStatus = "active";

  @Property({ columnType: "mission_type_enum" })
  missionType: MissionTypeEnum = "daily";

  @Property({ type: "string", nullable: true })
  category?: string | null;

  @Property({ type: "string", nullable: true })
  environmentalGoal?: string | null;

  @Property({ type: "integer", nullable: true })
  difficulty?: number | null;

  @Property({ type: "integer", nullable: true })
  effortMinutes?: number | null;

  @Property({ type: "string", nullable: true })
  costLevel?: string | null;

  @Property({ type: "integer", nullable: true })
  xpReward?: number | null;

  @Property({ type: "array", nullable: true })
  usedFactKeys?: string[];

  @Property({ type: "string", nullable: true })
  personalizationReason?: string | null;

  @Property({ type: "json" })
  generationSnapshot: Record<string, unknown> = {};

  @Property({ type: "json" })
  expectedImpact: Record<string, unknown> = {};

  @Property({ type: "string", nullable: true })
  patternKey?: string | null;

  @Property({ type: "string", nullable: true })
  actionFingerprint?: string | null;

  @Property({ type: "string", nullable: true })
  generationRequestId?: string | null;

  @Property({ type: "datetime", nullable: true })
  impactLoggedAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  completedAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  expiresAt?: Date | null;
}
