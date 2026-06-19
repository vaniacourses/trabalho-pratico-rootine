import { Entity, Opt, PrimaryKey, Property } from "@mikro-orm/core";

/** Eventos imutáveis — fonte de verdade do perfil (nunca editados). */
@Entity({ tableName: "user_profile_events" })
export class UserProfileEvent {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  eventType!: string;

  @Property({ type: "string" })
  source: string = "app";

  @Property({ type: "string", nullable: true })
  sourceTable?: string | null;

  @Property({ type: "uuid", nullable: true })
  sourceId?: string | null;

  @Property({ type: "json" })
  payload: Record<string, unknown> = {};

  @Property({ type: "json" })
  metadata: Record<string, unknown> = {};

  @Property({ type: "integer" })
  schemaVersion: number & Opt = 1;

  @Property({ type: "datetime", nullable: true })
  occurredAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
