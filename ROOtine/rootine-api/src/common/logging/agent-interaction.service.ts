import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { AgentInteraction } from "../../entities/agent-interaction.entity";

/** Porte de `logAgentInteraction`. Nunca loga JWT/prompt completo/dados sensíveis. */
@Injectable()
export class AgentInteractionLogger {
  private readonly logger = new Logger("AGENTS");

  constructor(private readonly em: EntityManager) {}

  async log(payload: {
    userId: string;
    agent: string;
    eventType: string;
    inputSummary: Record<string, unknown>;
    output: Record<string, unknown>;
    status?: "success" | "error";
    errorMessage?: string;
  }): Promise<void> {
    try {
      const interaction = this.em.create(AgentInteraction, {
        userId: payload.userId,
        agent: payload.agent,
        eventType: payload.eventType,
        inputSummary: payload.inputSummary,
        output: payload.output,
        status: payload.status ?? "success",
        errorMessage: payload.errorMessage ?? null,
      });
      await this.em.persistAndFlush(interaction);
    } catch (error) {
      this.logger.warn(`Failed to log interaction: ${error}`);
    }
  }
}
