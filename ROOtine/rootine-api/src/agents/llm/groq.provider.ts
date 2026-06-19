import { injectable } from "inversify";
import { env } from "../../config/env";
import { OpenAiCompatibleProvider } from "./openai-compatible.provider";

/**
 * Provedor Groq (API compatível com OpenAI). Alguns modelos não aceitam
 * `response_format: json_object`; nesse caso degradamos para texto livre e
 * deixamos o `parseJsonObject` extrair o JSON.
 */
@injectable()
export class GroqProvider extends OpenAiCompatibleProvider {
  readonly name = "groq";

  protected get apiKey(): string | undefined {
    return env.groqKey;
  }
  protected get model(): string {
    return env.groqModel;
  }
  protected get baseUrl(): string {
    return "https://api.groq.com/openai/v1/chat/completions";
  }

  protected override shouldRetryWithoutJsonMode(status: number, errorText: string): boolean {
    const lower = errorText.toLowerCase();
    return status === 400 && (lower.includes("response_format") || lower.includes("json_object"));
  }
}
