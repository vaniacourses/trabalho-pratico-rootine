/** Symbols/Tokens de injeção do contêiner InversifyJS dos agentes. */
export const TYPES = {
  AgentRunner: Symbol.for("AgentRunner"),
  LlmProvider: Symbol.for("LlmProvider"), // multi-bind: cascata de provedores de LLM (DIP/OCP)
  Orchestrator: Symbol.for("OrchestratorAgent"),
  ScientistAgent: Symbol.for("ScientistAgent"),
  HabitatAgent: Symbol.for("HabitatAgent"),
  AdventurerAgent: Symbol.for("AdventurerAgent"), // quizzes / conteúdo educativo (diagrama)
  GuardianAgent: Symbol.for("GuardianAgent"), // missões / desafios (diagrama)
} as const;

/**
 * Papéis internos enviados ao provedor de IA.
 *
 * ⚠️ Mapa de compatibilidade (ver seção 3 do relatório): o diagrama inverte
 * Aventureiro/Guardião em relação ao código Deno original. Mantemos os MESMOS
 * nomes de role nos logs/`agent_interactions` (`guardian`/`adventurer`) para não
 * quebrar histórico, mas a SEMÂNTICA segue o diagrama:
 *   - role "guardian"   -> Guardião -> missões/desafios
 *   - role "adventurer" -> Aventureiro -> quizzes/conteúdo educativo
 */
export type AgentRole = "orchestrator" | "habitat" | "scientist" | "guardian" | "adventurer";
