import { inject, injectable } from "inversify";
import { AgentRunner } from "../agent-runner.service";
import { TYPES } from "../types";
import type { SpecialistAgent } from "../specialist";

export interface GeneratedQuiz {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct_option: "A" | "B" | "C" | "D";
  explanation?: string;
  category?: string;
}

/**
 * `AgenteAventureiro` (diagrama): conteúdo educativo / quizzes.
 * Métodos: `gerarQuizzesDinamicos`, `ajustarDificuldadeConteudo`.
 * Nunca cria flashcards (catálogo determinístico no banco).
 */
@injectable()
export class AdventurerAgent implements SpecialistAgent {
  readonly key = "adventurer" as const;

  constructor(@inject(TYPES.AgentRunner) private readonly runner: AgentRunner) {}

  async gerarQuizzesDinamicos(context: unknown): Promise<{ quizzes: GeneratedQuiz[]; _fallback_reason?: string }> {
    return this.runner.runJsonAgent<{ quizzes: GeneratedQuiz[] } & Record<string, unknown>>({
      role: "adventurer",
      task: "Generate up to 3 concise multiple-choice sustainability quizzes in Brazilian Portuguese based on the user's journey. Return { \"quizzes\": [{ question, options:{A,B,C,D}, correct_option, explanation, category }] }.",
      context,
      fallback: { quizzes: [] },
    }) as Promise<{ quizzes: GeneratedQuiz[]; _fallback_reason?: string }>;
  }

  async ajustarDificuldadeConteudo(context: unknown): Promise<{ difficulty: number; _fallback_reason?: string }> {
    return this.runner.runJsonAgent<{ difficulty: number } & Record<string, unknown>>({
      role: "adventurer",
      task: "Suggest the next quiz difficulty (1-5) for this user based on recent quiz accuracy. Return { \"difficulty\": number }.",
      context,
      fallback: { difficulty: 1 },
    }) as Promise<{ difficulty: number; _fallback_reason?: string }>;
  }
}
