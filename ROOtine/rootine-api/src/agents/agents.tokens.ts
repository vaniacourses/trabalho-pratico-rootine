/** Tokens de injeção do lado NestJS (ponte Nest ↔ Inversify). */
export const AGENT_PROVIDERS = {
  Orchestrator: "ORCHESTRATOR",
  Guardian: "GUARDIAN_AGENT",
  Adventurer: "ADVENTURER_AGENT",
  Scientist: "SCIENTIST_AGENT",
  Habitat: "HABITAT_AGENT",
  Runner: "AGENT_RUNNER",
} as const;
