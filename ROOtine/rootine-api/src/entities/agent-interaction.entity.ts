import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/** Log de IA — `agent`, `event_type`, `input_summary`, `output`, `status`. */
@Entity({ tableName: "agent_interactions" })
export class AgentInteraction {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  agent!: string;

  @Property({ type: "string" })
  eventType!: string;

  @Property({ type: "json", nullable: true })
  inputSummary?: Record<string, unknown> | null;

  @Property({ type: "json", nullable: true })
  output?: Record<string, unknown> | null;

  @Property({ type: "string" })
  status: string = "success";

  @Property({ type: "string", nullable: true })
  errorMessage?: string | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
