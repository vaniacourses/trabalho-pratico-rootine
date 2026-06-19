import { injectable } from "inversify";
import type { LlmCompletionRequest, LlmProvider } from "./llm-provider";

/**
 * Base para provedores compatíveis com a API `chat/completions` da OpenAI
 * (OpenAI e Groq compartilham o mesmo formato de requisição/resposta).
 *
 * As subclasses descrevem apenas o que VARIA — chave, modelo, URL e
 * particularidades de JSON mode. Toda a lógica de transporte vive aqui uma única
 * vez (DRY + High Cohesion). Como qualquer subclasse honra o contrato
 * `LlmProvider`, o `AgentRunner` as trata de forma intercambiável (LSP).
 */
@injectable()
export abstract class OpenAiCompatibleProvider implements LlmProvider {
  abstract readonly name: string;
  protected abstract get apiKey(): string | undefined;
  protected abstract get model(): string;
  protected abstract get baseUrl(): string;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete({ systemPrompt, userPrompt, jsonMode }: LlmCompletionRequest): Promise<string> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new Error(`${this.name} provider is not configured.`);
    return this.request(apiKey, systemPrompt, userPrompt, jsonMode);
  }

  private async request(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    useJsonMode: boolean,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
    if (useJsonMode) body.response_format = { type: "json_object" };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (useJsonMode && this.shouldRetryWithoutJsonMode(response.status, errorText)) {
        console.warn(`[AGENTS] ${this.name} JSON mode unsupported, retrying without response_format.`);
        return this.request(apiKey, systemPrompt, userPrompt, false);
      }
      throw new Error(`Erro ${this.name}: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as any;
    return String(data.choices?.[0]?.message?.content ?? "");
  }

  /**
   * Hook de variação protegida: por padrão não degrada o JSON mode. Subclasses
   * cujo backend não suporta `response_format` sobrescrevem esta decisão.
   */
  protected shouldRetryWithoutJsonMode(_status: number, _errorText: string): boolean {
    return false;
  }
}
