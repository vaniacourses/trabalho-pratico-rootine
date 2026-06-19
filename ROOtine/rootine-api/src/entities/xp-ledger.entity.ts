import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";

/** Razão idempotente de XP — unique (user_id, idempotency_key). */
@Entity({ tableName: "xp_ledger" })
@Unique({ properties: ["userId", "idempotencyKey"] })
export class XpLedger {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  sourceType!: string;

  @Property({ type: "uuid", nullable: true })
  sourceId?: string | null;

  @Property({ type: "string", nullable: true })
  reason?: string | null;

  @Property({ type: "integer" })
  xpDelta!: number;

  @Property({ type: "string" })
  idempotencyKey!: string;

  @Property({ type: "json" })
  metadata: Record<string, unknown> = {};

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
