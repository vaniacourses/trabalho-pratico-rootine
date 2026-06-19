import { Collection, Entity, OneToMany, PrimaryKey, Property } from "@mikro-orm/core";
import { GuildMember } from "./guild-member.entity";

/**
 * `Guilda` (diagrama) — feature NOVA, não existia no schema legado.
 * Ver DDL apêndice em `ddl.sql`/`add.sql` (tabelas `guilds` / `guild_members`).
 */
@Entity({ tableName: "guilds" })
export class Guild {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "integer", fieldName: "pontuacao_acumulada" })
  pontuacaoAcumulada: number = 0;

  @OneToMany(() => GuildMember, (member) => member.guild)
  members = new Collection<GuildMember>(this);

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
