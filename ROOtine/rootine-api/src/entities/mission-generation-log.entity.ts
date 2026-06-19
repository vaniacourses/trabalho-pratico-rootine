import { Entity, Opt, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "mission_generation_logs" })
export class MissionGenerationLog {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "uuid", nullable: true })
  missionId?: string | null;

  @Property({ type: "string" })
  missionType: string = "daily";

  @Property({ type: "string" })
  contextVersion: string & Opt = "MissionGenerationContextV1";

  @Property({ type: "array" })
  candidatePatternKeys: string[] = [];

  @Property({ type: "string", nullable: true })
  selectedPatternKey?: string | null;

  @Property({ type: "string", nullable: true })
  selectedActionFingerprint?: string | null;

  @Property({ type: "json" })
  rejectedCandidates: unknown[] & Opt = [];

  @Property({ type: "json" })
  validationErrors: unknown[] = [];

  @Property({ type: "json" })
  generationSnapshot: Record<string, unknown> = {};

  @Property({ type: "boolean" })
  usedFallback: boolean = false;

  @Property({ type: "string" })
  status: string = "success";

  @Property({ type: "string", nullable: true })
  errorMessage?: string | null;

  @Property({ type: "datetime", nullable: true })
  requestedAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
