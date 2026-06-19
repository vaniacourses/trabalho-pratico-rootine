import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Guild } from "../entities/guild.entity";
import { GuildMember } from "../entities/guild-member.entity";
import { Profile } from "../entities/profile.entity";
import { getLevelFromXp } from "../domain";

/**
 * `Guilda` (diagrama) — feature NOVA. Métodos: `adicionarMembro`,
 * `calcularRankingInterno`. Relação `User 0..1 — many Guilda`.
 */
@Injectable()
export class GuildsService {
  constructor(private readonly em: EntityManager) {}

  async create(name: string) {
    const guild = this.em.create(Guild, { name, pontuacaoAcumulada: 0, createdAt: new Date() });
    await this.em.persistAndFlush(guild);
    return guild;
  }

  async adicionarMembro(guildId: string, userId: string) {
    const guild = await this.em.findOne(Guild, { id: guildId });
    if (!guild) throw new NotFoundException("guild_not_found");

    const already = await this.em.findOne(GuildMember, { userId });
    if (already) throw new BadRequestException("user_already_in_a_guild");

    const member = this.em.create(GuildMember, { guild, userId, role: "member", joinedAt: new Date() });
    await this.em.persistAndFlush(member);
    return member;
  }

  /** Ranking interno dos membros por XP (cache derivado da curva de XP). */
  async calcularRankingInterno(guildId: string) {
    const guild = await this.em.findOne(Guild, { id: guildId });
    if (!guild) throw new NotFoundException("guild_not_found");

    const members = await this.em.find(GuildMember, { guild: guildId });
    const profiles = await this.em.find(Profile, { id: { $in: members.map((m) => m.userId) } });
    const xpByUser = new Map(profiles.map((p) => [p.id, p.xp]));

    const ranking = members
      .map((member) => {
        const xp = xpByUser.get(member.userId) ?? 0;
        return { userId: member.userId, xp, level: getLevelFromXp(xp).level };
      })
      .sort((a, b) => b.xp - a.xp);

    const pontuacaoAcumulada = ranking.reduce((sum, entry) => sum + entry.xp, 0);
    guild.pontuacaoAcumulada = pontuacaoAcumulada;
    await this.em.persistAndFlush(guild);

    return { guildId, name: guild.name, pontuacaoAcumulada, ranking };
  }
}
