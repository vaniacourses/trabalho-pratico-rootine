import type { AgentRole } from "./types";

/** Chaves de especialistas que o orquestrador pode acionar. */
export type SpecialistKey = "guardian" | "adventurer" | "scientist" | "habitat";

/**
 * Contrato comum dos agentes especialistas (Polymorphism + Protected Variations).
 *
 * Dá ao `OrchestratorAgent` um tipo único para tratar todo especialista, em vez
 * de um `switch` sobre uma união de classes concretas. Registrar um novo
 * especialista passa a ser adicioná-lo ao mapa — sem editar o roteamento (OCP).
 */
export interface SpecialistAgent {
  /** Identidade do especialista; também serve de chave no registro. */
  readonly key: SpecialistKey;
}

/** A chave de especialista é, por construção, um `AgentRole` válido. */
export function specialistAsAgentRole(key: SpecialistKey): AgentRole {
  return key;
}
