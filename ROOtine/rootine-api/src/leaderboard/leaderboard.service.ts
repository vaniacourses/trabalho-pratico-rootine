import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Guild } from "../entities/guild.entity";
import { GuildMember } from "../entities/guild-member.entity";
import { ImpactLedger } from "../entities/impact-ledger.entity";
import { aggregateImpactRows } from "../domain";

/** `Leaderboard` (diagrama) — feature NOVA: `rankearGuildas`, `compararImpactoAmbiental`. */
@Injectable()
export class LeaderboardService {
  constructor(private readonly em: EntityManager) {}

  async rankearGuildas() {
    const guilds = await this.em.find(Guild, {}, { orderBy: { pontuacaoAcumulada: "desc" } });
    const counts = await this.em.find(GuildMember, {});
    const membersByGuild = new Map<string, number>();
    for (const member of counts) {
      const guildId = member.guild.id;
      membersByGuild.set(guildId, (membersByGuild.get(guildId) ?? 0) + 1);
    }
    return guilds.map((guild, index) => ({
      rank: index + 1,
      guildId: guild.id,
      name: guild.name,
      pontuacaoAcumulada: guild.pontuacaoAcumulada,
      memberCount: membersByGuild.get(guild.id) ?? 0,
    }));
  }

  /** Soma o impacto ambiental agregado dos membros de cada guilda. */
  async compararImpactoAmbiental() {
    const guilds = await this.em.find(Guild, {});
    const members = await this.em.find(GuildMember, {});
    const usersByGuild = new Map<string, string[]>();
    for (const member of members) {
      const list = usersByGuild.get(member.guild.id) ?? [];
      list.push(member.userId);
      usersByGuild.set(member.guild.id, list);
    }

    const result: { guildId: string; name: string; impact: Record<string, number> }[] = [];
    for (const guild of guilds) {
      const userIds = usersByGuild.get(guild.id) ?? [];
      const impacts = userIds.length
        ? await this.em.find(ImpactLedger, { userId: { $in: userIds } })
        : [];
      const totals = aggregateImpactRows(
        impacts.map((row) => ({ impact: row.impact, logged_at: row.loggedAt?.toISOString() ?? null })),
      ).total;
      result.push({ guildId: guild.id, name: guild.name, impact: totals });
    }
    return result.sort((a, b) => b.impact.co2_kg - a.impact.co2_kg);
  }
}
