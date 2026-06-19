import { Entity, ManyToOne, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { Guild } from "./guild.entity";

/** Relação `User 0..1 — many Guilda` (diagrama). */
@Entity({ tableName: "guild_members" })
@Unique({ properties: ["userId"] })
export class GuildMember {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Guild, { fieldName: "guild_id" })
  guild!: Guild;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  role: string = "member";

  @Property({ type: "datetime", nullable: true })
  joinedAt?: Date | null;
}
