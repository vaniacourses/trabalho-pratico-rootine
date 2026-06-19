import { inject, injectable } from "inversify";
import { AgentRunner } from "../agent-runner.service";
import { TYPES } from "../types";
import type { SpecialistAgent } from "../specialist";

export interface HabitatLeafMessage {
  position: number;
  title: string;
  message: string;
}

/**
 * `AgenteHabitat` (diagrama): `gerarEvolucaoHabitat`, `definirMetasSustentaveis`.
 * Dá personalidade à árvore (folhas narrativas), sem conversar com o usuário.
 */
@injectable()
export class HabitatAgent implements SpecialistAgent {
  readonly key = "habitat" as const;

  constructor(@inject(TYPES.AgentRunner) private readonly runner: AgentRunner) {}

  async gerarEvolucaoHabitat(
    context: unknown,
  ): Promise<{ leaves: HabitatLeafMessage[]; _fallback_reason?: string }> {
    return this.runner.runJsonAgent<{ leaves: HabitatLeafMessage[] } & Record<string, unknown>>({
      role: "habitat",
      task: "Generate up to 3 short clickable leaf messages for the Rootine tree in Brazilian Portuguese, epic and ancestral voice, grounded in the user's history. Return { \"leaves\": [{ position, title, message }] }.",
      context,
      fallback: { leaves: [] },
    }) as Promise<{ leaves: HabitatLeafMessage[]; _fallback_reason?: string }>;
  }
}
