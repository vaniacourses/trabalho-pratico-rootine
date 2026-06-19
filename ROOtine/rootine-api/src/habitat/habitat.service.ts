import { Inject, Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { getLevelFromXp } from "../domain";
import { Profile } from "../entities/profile.entity";
import { HabitatLeaf } from "../entities/habitat-leaf.entity";
import { AGENT_PROVIDERS } from "../agents/agents.tokens";
import { HabitatAgent } from "../agents/habitat/habitat.agent";
import { AgentInteractionLogger } from "../common/logging/agent-interaction.service";

/**
 * Porte de `habitat-leaves` (Habitat — diagrama). Nível/saúde da árvore são
 * DERIVADOS da curva de XP (`getLevelFromXp`), nunca de `xp/120`.
 */
@Injectable()
export class HabitatService {
  constructor(
    private readonly em: EntityManager,
    private readonly agentLogger: AgentInteractionLogger,
    @Inject(AGENT_PROVIDERS.Habitat) private readonly habitat: HabitatAgent,
  ) {}

  async getHabitat(userId: string) {
    const profile = await this.em.findOne(Profile, { id: userId });
    const level = getLevelFromXp(profile?.xp ?? 0);
    const leaves = await this.em.find(HabitatLeaf, { userId }, { orderBy: { position: "asc" } });
    return {
      userId,
      level,
      health: Number(level.progress.toFixed(4)),
      leaves: leaves.map((leaf) => ({
        id: leaf.id,
        position: leaf.position,
        title: leaf.title,
        message: leaf.message,
      })),
    };
  }

  async generateLeaves(userId: string) {
    const profile = await this.em.findOne(Profile, { id: userId });
    const level = getLevelFromXp(profile?.xp ?? 0);
    const result = await this.habitat.gerarEvolucaoHabitat({ level: level.level, milestone: level.milestone });

    const created: HabitatLeaf[] = [];
    for (const leaf of result.leaves ?? []) {
      const entity = this.em.create(HabitatLeaf, {
        userId,
        position: leaf.position ?? created.length + 1,
        title: leaf.title ?? "Folha",
        message: leaf.message ?? "",
        sourceEvent: { ai_used: !result._fallback_reason },
      });
      created.push(entity);
    }
    if (created.length > 0) await this.em.persistAndFlush(created);

    await this.agentLogger.log({
      userId,
      agent: "habitat",
      eventType: "HABITAT_LEAVES_GENERATED",
      inputSummary: { level: level.level },
      output: { count: created.length, fallback_reason: result._fallback_reason ?? null },
    });

    return { count: created.length };
  }
}
