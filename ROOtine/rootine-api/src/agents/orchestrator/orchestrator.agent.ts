import { inject, injectable } from "inversify";
import { AgentRunner } from "../agent-runner.service";
import { GuardianAgent } from "../guardian/guardian.agent";
import { AdventurerAgent } from "../adventurer/adventurer.agent";
import { ScientistAgent } from "../scientist/scientist.agent";
import { HabitatAgent } from "../habitat/habitat.agent";
import { TYPES, type AgentRole } from "../types";
import { specialistAsAgentRole, type SpecialistAgent, type SpecialistKey } from "../specialist";

// Reexport para compatibilidade com importadores existentes.
export type { SpecialistKey } from "../specialist";

/**
 * `AgenteOrquestrador` (diagrama): fachada da camada de IA que decide como
 * interpretar a intenção do usuário e delega aos especialistas. As fachadas de
 * negócio com persistência (`criarCadastro`, `concluirMissao`, `gerirGuilda`)
 * vivem no módulo `orchestrator` do NestJS, que orquestra os serviços de domínio.
 */
@injectable()
export class OrchestratorAgent {
  /** Registro chave → especialista; substitui o `switch` de roteamento (OCP). */
  private readonly specialists: ReadonlyMap<SpecialistKey, SpecialistAgent>;

  constructor(
    @inject(TYPES.AgentRunner) private readonly runner: AgentRunner,
    @inject(TYPES.GuardianAgent) public readonly guardian: GuardianAgent,
    @inject(TYPES.AdventurerAgent) public readonly adventurer: AdventurerAgent,
    @inject(TYPES.ScientistAgent) public readonly scientist: ScientistAgent,
    @inject(TYPES.HabitatAgent) public readonly habitat: HabitatAgent,
  ) {
    const roster: SpecialistAgent[] = [this.guardian, this.adventurer, this.scientist, this.habitat];
    this.specialists = new Map(roster.map((agent) => [agent.key, agent]));
  }

  /** Decide qual especialista deve tratar a intenção do usuário. */
  async processarIntencaoUsuario(input: string, context: unknown): Promise<{ specialist: SpecialistKey; reason: string }> {
    const result = await this.runner.runJsonAgent<{ specialist: SpecialistKey; reason: string }>({
      role: "orchestrator",
      task: `Classify which specialist should handle the user's intent. One of: "guardian" (missions/challenges), "adventurer" (quizzes/educational content), "scientist" (profile insights/chat), "habitat" (tree narrative). User intent: ${input}. Return { "specialist": string, "reason": string }.`,
      context,
      fallback: { specialist: "scientist", reason: "fallback_default_specialist" },
    });
    return result;
  }

  /** Resolve o especialista pelo registro; cai no Cientista se a chave for desconhecida. */
  delegarParaEspecialista(specialist: SpecialistKey): SpecialistAgent {
    return this.specialists.get(specialist) ?? this.scientist;
  }

  asAgentRole(specialist: SpecialistKey): AgentRole {
    return specialistAsAgentRole(specialist);
  }
}
