import { Global, Module } from "@nestjs/common";
import { agentsContainer } from "./container";
import { TYPES } from "./types";
import { AGENT_PROVIDERS } from "./agents.tokens";
import { AgentRunner } from "./agent-runner.service";
import { OrchestratorAgent } from "./orchestrator/orchestrator.agent";
import { GuardianAgent } from "./guardian/guardian.agent";
import { AdventurerAgent } from "./adventurer/adventurer.agent";
import { ScientistAgent } from "./scientist/scientist.agent";
import { HabitatAgent } from "./habitat/habitat.agent";

/**
 * Ponte Nest ↔ Inversify: cada provider Nest resolve a instância singleton do
 * contêiner InversifyJS via factory (`container.get(...)`).
 */
@Global()
@Module({
  providers: [
    { provide: AGENT_PROVIDERS.Runner, useFactory: () => agentsContainer.get<AgentRunner>(TYPES.AgentRunner) },
    { provide: AGENT_PROVIDERS.Orchestrator, useFactory: () => agentsContainer.get<OrchestratorAgent>(TYPES.Orchestrator) },
    { provide: AGENT_PROVIDERS.Guardian, useFactory: () => agentsContainer.get<GuardianAgent>(TYPES.GuardianAgent) },
    { provide: AGENT_PROVIDERS.Adventurer, useFactory: () => agentsContainer.get<AdventurerAgent>(TYPES.AdventurerAgent) },
    { provide: AGENT_PROVIDERS.Scientist, useFactory: () => agentsContainer.get<ScientistAgent>(TYPES.ScientistAgent) },
    { provide: AGENT_PROVIDERS.Habitat, useFactory: () => agentsContainer.get<HabitatAgent>(TYPES.HabitatAgent) },
  ],
  exports: [
    AGENT_PROVIDERS.Runner,
    AGENT_PROVIDERS.Orchestrator,
    AGENT_PROVIDERS.Guardian,
    AGENT_PROVIDERS.Adventurer,
    AGENT_PROVIDERS.Scientist,
    AGENT_PROVIDERS.Habitat,
  ],
})
export class AgentsModule {}
