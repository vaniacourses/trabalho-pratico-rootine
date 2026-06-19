import { Inject, Injectable } from "@nestjs/common";
import { AGENT_PROVIDERS } from "../agents/agents.tokens";
import { OrchestratorAgent } from "../agents/orchestrator/orchestrator.agent";
import { UsersService } from "../users/users.service";
import { MissionsService } from "../missions/missions.service";
import { GuildsService } from "../guilds/guilds.service";

/**
 * Fachada de negócio do `AgenteOrquestrador` (diagrama): concentra o que estava
 * fragmentado entre Edge Functions e o `useEcoStore`. A classificação de
 * intenção usa o agente Inversify; as ações de negócio delegam aos serviços de
 * domínio do NestJS.
 */
@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(AGENT_PROVIDERS.Orchestrator) private readonly orchestrator: OrchestratorAgent,
    private readonly users: UsersService,
    private readonly missions: MissionsService,
    private readonly guilds: GuildsService,
  ) {}

  /** `processarIntencaoUsuario` + `delegarParaEspecialista`. */
  async processarIntencaoUsuario(userId: string, input: string) {
    const decision = await this.orchestrator.processarIntencaoUsuario(input, { userId });
    return { userId, ...decision };
  }

  /** `criarCadastro`. */
  async criarCadastro(userId: string, nome?: string) {
    const profile = await this.users.ensureProfile(userId, nome);
    return { userId: profile.id, created: true };
  }

  /** `concluirMissao`. */
  concluirMissao(userId: string, missionId: string) {
    return this.missions.complete(userId, missionId);
  }

  /** `gerirGuilda`. */
  gerirGuilda(name: string) {
    return this.guilds.create(name);
  }
}
