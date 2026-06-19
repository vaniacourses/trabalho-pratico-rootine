import { injectable } from "inversify";
import { env } from "../../config/env";
import { OpenAiCompatibleProvider } from "./openai-compatible.provider";

/** Provedor OpenAI (chat/completions). Suporta JSON mode nativamente. */
@injectable()
export class OpenAiProvider extends OpenAiCompatibleProvider {
  readonly name = "openai";

  protected get apiKey(): string | undefined {
    return env.openAiKey;
  }
  protected get model(): string {
    return env.openAiModel;
  }
  protected get baseUrl(): string {
    return "https://api.openai.com/v1/chat/completions";
  }
}
