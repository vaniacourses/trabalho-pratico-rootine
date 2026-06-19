import { Entity, Opt, PrimaryKey, Property, Unique } from "@mikro-orm/core";

@Entity({ tableName: "user_profile_facts" })
@Unique({ properties: ["userId", "factKey"] })
export class UserProfileFact {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  factKey!: string;

  @Property({ type: "string" })
  factType!: string;

  @Property({ type: "string", nullable: true })
  category?: string | null;

  @Property({ type: "json" })
  value: Record<string, unknown> = {};

  @Property({ type: "float" })
  confidence: number = 0.5;

  @Property({ type: "array" })
  sourceEventIds: string[] = [];

  @Property({ type: "boolean" })
  active: boolean = true;

  @Property({ type: "string" })
  derivedBy: string = "deterministic";

  @Property({ type: "integer" })
  evidenceCount: number & Opt = 1;

  @Property({ type: "datetime", nullable: true })
  firstSeenAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  lastSeenAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  updatedAt?: Date | null;
}
