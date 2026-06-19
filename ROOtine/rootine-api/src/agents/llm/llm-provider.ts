import type { AgentRole } from "../types";

export interface LlmCompletionRequest {
  role: AgentRole;
  systemPrompt: string;
  userPrompt: string;
  /** Pede saída JSON estrita quando o provedor suportar. */
  jsonMode: boolean;
}

/**
 * Abstração de provedor de LLM (DIP + Protected Variations).
 *
 * O `AgentRunner` (módulo de alto nível) depende DESTE contrato e nunca de
 * OpenAI/Groq/Anthropic concretos. Adicionar um novo provedor passa a ser
 * apenas registrar uma nova implementação no contêiner — sem tocar no
 * `AgentRunner` (OCP). Qualquer implementação é substituível onde se espera um
 * `LlmProvider` (LSP).
 */
export interface LlmProvider {
  /** Identificador estável para logs (ex.: "openai", "groq"). */
  readonly name: string;
  /** true quando há credenciais/config suficientes para tentar este provedor. */
  isConfigured(): boolean;
  /** Executa a completion e retorna o texto bruto do modelo. */
  complete(request: LlmCompletionRequest): Promise<string>;
}
