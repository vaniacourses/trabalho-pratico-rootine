import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";

/** Razão idempotente de impacto — unique (user_id, idempotency_key) + único por missão. */
@Entity({ tableName: "impact_ledger" })
@Unique({ properties: ["userId", "idempotencyKey"] })
export class ImpactLedger {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "uuid", nullable: true })
  missionId?: string | null;

  @Property({ type: "string" })
  sourceType: string = "mission";

  @Property({ type: "json" })
  impact: Record<string, unknown> = {};

  @Property({ type: "boolean" })
  estimated: boolean = true;

  @Property({ type: "float", nullable: true })
  confidence?: number | null;

  @Property({ type: "string" })
  idempotencyKey!: string;

  @Property({ type: "string", nullable: true })
  patternKey?: string | null;

  @Property({ type: "string" })
  impactModelKey: string = "legacy.default";

  @Property({ type: "string" })
  modelVersion: string = "impact_model_v1";

  @Property({ type: "json" })
  metadata: Record<string, unknown> = {};

  @Property({ type: "datetime", nullable: true })
  loggedAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
