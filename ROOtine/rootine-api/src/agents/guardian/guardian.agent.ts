import { inject, injectable } from "inversify";
import { AgentRunner } from "../agent-runner.service";
import { TYPES } from "../types";
import type { SpecialistAgent } from "../specialist";
import type { MissionCandidate } from "../../domain";

/**
 * `AgenteGuardiao` (diagrama): missões/desafios.
 * Métodos do diagrama: `selecionarMissoesDiarias`, `customizarDesafios`, `gerencia(id)`.
 * A IA apenas melhora texto/variações de um candidato determinístico; os
 * validadores de domínio decidem o que é salvo (regra de produto).
 */
@injectable()
export class GuardianAgent implements SpecialistAgent {
  readonly key = "guardian" as const;

  constructor(@inject(TYPES.AgentRunner) private readonly runner: AgentRunner) {}

  /** Refina/varia um candidato de missão preservando os campos estruturados. */
  async customizarDesafios(
    baseCandidate: MissionCandidate,
    context: unknown,
  ): Promise<MissionCandidate & { _fallback_reason?: string }> {
    return this.runner.runJsonAgent<MissionCandidate & Record<string, unknown>>({
      role: "guardian",
      task: "Improve the wording and personalization of this Brazilian-Portuguese sustainability mission. Keep ALL structured fields (category, difficulty, effort_minutes, cost_level, used_fact_keys, expected_impact) unchanged. Only refine title, description and personalization_reason. Match the framing to mission_type: if mission_type is 'daily', it must be a small, concrete action the person can finish TODAY in their routine; if mission_type is 'specialized', it is a WEEKLY mission of larger magnitude — a more structural sustainable change to build over ~7 days. Do not turn a weekly mission into a trivial daily task, and do not make a daily task sound like a week-long project.",
      context: { baseCandidate, context },
      fallback: baseCandidate as MissionCandidate & Record<string, unknown>,
    }) as Promise<MissionCandidate & { _fallback_reason?: string }>;
  }

  /** Sugere quais patterns priorizar no dia (ranking apenas indicativo). */
  async selecionarMissoesDiarias(context: unknown): Promise<{ pattern_keys: string[]; _fallback_reason?: string }> {
    return this.runner.runJsonAgent<{ pattern_keys: string[] } & Record<string, unknown>>({
      role: "guardian",
      task: "Given the user's profile facts and recent missions, rank up to 5 mission pattern keys that fit best today. Return { \"pattern_keys\": string[] }.",
      context,
      fallback: { pattern_keys: [] },
    }) as Promise<{ pattern_keys: string[]; _fallback_reason?: string }>;
  }
}
