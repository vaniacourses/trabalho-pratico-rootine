import { Inject, Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { getLevelFromXp } from "../domain";
import { Profile } from "../entities/profile.entity";
import { UserProfileFact } from "../entities/user-profile-fact.entity";
import { UserProfileEvent } from "../entities/user-profile-event.entity";
import { AGENT_PROVIDERS } from "../agents/agents.tokens";
import { ScientistAgent } from "../agents/scientist/scientist.agent";
import { AgentInteractionLogger } from "../common/logging/agent-interaction.service";

/**
 * Porte de `profile-scientist-chat` (chat do Cientista) e `sync-user-brain`
 * (agregador determinístico — SEM IA por regra).
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger("SCIENTIST");

  constructor(
    private readonly em: EntityManager,
    private readonly agentLogger: AgentInteractionLogger,
    @Inject(AGENT_PROVIDERS.Scientist) private readonly scientist: ScientistAgent,
  ) {}

  async scientistChat(userId: string, message: string) {
    const profile = await this.em.findOne(Profile, { id: userId });
    const facts = await this.em.find(UserProfileFact, { userId, active: true });
    const level = getLevelFromXp(profile?.xp ?? 0);

    const result = await this.scientist.chat(message, {
      level: level.level,
      milestone: level.milestone,
      fact_keys: facts.map((f) => f.factKey),
    });

    await this.agentLogger.log({
      userId,
      agent: "scientist",
      eventType: "SCIENTIST_CHAT",
      inputSummary: { message_length: message.length },
      output: { fallback_reason: result._fallback_reason ?? null },
      status: result._fallback_reason ? "error" : "success",
    });

    await this.em.persistAndFlush(
      this.em.create(UserProfileEvent, {
        userId,
        eventType: "SCIENTIST_CHAT",
        source: "profile",
        payload: {
          message_length: message.length,
          fallback_reason: result._fallback_reason ?? null,
        },
      }),
    );

    return { answer: result.answer, fallback_reason: result._fallback_reason ?? null };
  }

  /** Agregador determinístico de perfil (eventos → fatos/caches). Nunca usa IA. */
  async syncBrain(userId: string) {
    const [facts, events] = await Promise.all([
      this.em.find(UserProfileFact, { userId, active: true }),
      this.em.count(UserProfileEvent, { userId }),
    ]);
    const profile = await this.em.findOne(Profile, { id: userId });
    this.logger.log(`[BRAIN] Sync deterministico. user=${userId} facts=${facts.length} events=${events}`);
    return {
      userId,
      level: getLevelFromXp(profile?.xp ?? 0),
      activeFacts: facts.length,
      totalEvents: events,
      affinities: profile?.affinities ?? {},
    };
  }
}
