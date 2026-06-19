import { Container } from "inversify";
import { AgentRunner } from "./agent-runner.service";
import { OrchestratorAgent } from "./orchestrator/orchestrator.agent";
import { ScientistAgent } from "./scientist/scientist.agent";
import { HabitatAgent } from "./habitat/habitat.agent";
import { AdventurerAgent } from "./adventurer/adventurer.agent";
import { GuardianAgent } from "./guardian/guardian.agent";
import { OpenAiProvider } from "./llm/openai.provider";
import { GroqProvider } from "./llm/groq.provider";
import { TYPES } from "./types";

/**
 * Contêiner IoC InversifyJS dedicado à camada de agentes/domínio de IA.
 * O NestJS DI continua responsável pelo transporte HTTP; os agentes são
 * stateless e dependem só de env, então `inSingletonScope` é adequado.
 */
export function buildAgentsContainer(): Container {
  const container = new Container();

  // Cascata de provedores de LLM em ordem de prioridade (OpenAI → Groq).
  // A ordem dos binds define a ordem do @multiInject no AgentRunner.
  container.bind(TYPES.LlmProvider).to(OpenAiProvider).inSingletonScope();
  container.bind(TYPES.LlmProvider).to(GroqProvider).inSingletonScope();

  container.bind(TYPES.AgentRunner).to(AgentRunner).inSingletonScope();
  container.bind(TYPES.GuardianAgent).to(GuardianAgent).inSingletonScope();
  container.bind(TYPES.AdventurerAgent).to(AdventurerAgent).inSingletonScope();
  container.bind(TYPES.ScientistAgent).to(ScientistAgent).inSingletonScope();
  container.bind(TYPES.HabitatAgent).to(HabitatAgent).inSingletonScope();
  container.bind(TYPES.Orchestrator).to(OrchestratorAgent).inSingletonScope();

  return container;
}

export const agentsContainer = buildAgentsContainer();
