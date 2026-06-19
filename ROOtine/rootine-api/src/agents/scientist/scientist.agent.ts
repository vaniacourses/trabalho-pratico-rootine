import { inject, injectable } from "inversify";
import { AgentRunner } from "../agent-runner.service";
import { TYPES } from "../types";
import type { SpecialistAgent } from "../specialist";

export interface ScientistChatResult {
  answer: string;
  _fallback_reason?: string;
}

/**
 * `AgenteCientista` (diagrama): `calcularMetricasImpacto`, `analisarTendenciasComportamentais`.
 * Pode conversar diretamente com o usuário (chat do Cientista).
 */
@injectable()
export class ScientistAgent implements SpecialistAgent {
  readonly key = "scientist" as const;

  constructor(@inject(TYPES.AgentRunner) private readonly runner: AgentRunner) {}

  async chat(message: string, context: unknown): Promise<ScientistChatResult> {
    return this.runner.runJsonAgent<ScientistChatResult & Record<string, unknown>>({
      role: "scientist",
      task: `Answer the user's message in Brazilian Portuguese with a short, practical, day-to-day protocol grounded in their app history. User message: ${message}. Return { "answer": string }.`,
      context,
      fallback: {
        answer:
          "Ainda não consigo responder agora. Continue registrando suas ações que eu te ajudo a evoluir seus protocolos.",
      },
    });
  }
}
