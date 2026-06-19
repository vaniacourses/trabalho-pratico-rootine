import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { QuizQuestion } from "../entities/quiz-question.entity";
import { Quiz } from "../entities/quiz.entity";
import { UserQuizAnswer } from "../entities/user-quiz-answer.entity";
import { UserProfileEvent } from "../entities/user-profile-event.entity";
import { AGENT_PROVIDERS } from "../agents/agents.tokens";
import { AdventurerAgent } from "../agents/adventurer/adventurer.agent";
import { AgentInteractionLogger } from "../common/logging/agent-interaction.service";
import { ProgressService } from "../progress/progress.service";

/**
 * Porte de `generate-quiz` / `answer-adventure-quiz` (Aventureiro — diagrama).
 * Seleção determinística do catálogo `quiz_questions`; a IA é opcional e só
 * sugere variações/dificuldade.
 */
@Injectable()
export class QuizService {
  private readonly logger = new Logger("ADVENTURE");

  constructor(
    private readonly em: EntityManager,
    private readonly progress: ProgressService,
    private readonly agentLogger: AgentInteractionLogger,
    @Inject(AGENT_PROVIDERS.Adventurer) private readonly adventurer: AdventurerAgent,
  ) {}

  async generate(userId: string, amount = 3) {
    const catalog = await this.em.find(QuizQuestion, { active: true });
    const selected = [...catalog].sort(() => Math.random() - 0.5).slice(0, amount);

    await this.agentLogger.log({
      userId,
      agent: "adventurer",
      eventType: "QUIZ_SELECTED",
      inputSummary: { amount },
      output: { count: selected.length },
    });

    return selected.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      category: q.category,
      difficulty: q.difficulty,
    }));
  }

  /**
   * Compat ex-`generate-quiz`: seleciona uma pergunta do catálogo, grava um
   * snapshot em `quizzes` e devolve no shape que o app espera (com options
   * `[{id,text}]` e `correct_option`).
   */
  async generateAdventure(userId: string) {
    const catalog = await this.em.find(QuizQuestion, { active: true });
    if (catalog.length === 0) throw new NotFoundException("quiz_catalog_empty");
    const question = catalog[Math.floor(Math.random() * catalog.length)];

    const quiz = this.em.create(Quiz, {
      userId,
      question: question.question,
      options: question.options,
      correctOption: question.correctOption,
      explanation: question.explanation ?? null,
      category: question.category,
      createdAt: new Date(),
    });
    await this.em.persistAndFlush(quiz);

    await this.agentLogger.log({
      userId,
      agent: "adventurer",
      eventType: "QUIZ_SELECTED",
      inputSummary: { amount: 1 },
      output: { quiz_id: quiz.id, quiz_question_id: question.id },
    });

    return {
      id: quiz.id,
      quiz_question_id: question.id,
      question: question.question,
      options: question.options,
      correct_option: question.correctOption,
      explanation: question.explanation ?? "",
      category: question.category,
      difficulty: question.difficulty,
      signal_key: question.signalKey ?? null,
    };
  }

  async answer(input: { userId: string; quizQuestionId: string; selectedOption: string }) {
    const question = await this.em.findOne(QuizQuestion, { id: input.quizQuestionId });
    const correct = question?.correctOption === input.selectedOption;

    const record = this.em.create(UserQuizAnswer, {
      userId: input.userId,
      quizQuestionId: input.quizQuestionId,
      selectedOption: input.selectedOption,
      correct,
      answeredAt: new Date(),
    });
    await this.em.persistAndFlush(record);

    await this.em.persistAndFlush(
      this.em.create(UserProfileEvent, {
        userId: input.userId,
        eventType: "QUIZ_COMPLETED",
        source: "adventure",
        sourceTable: "user_quiz_answers",
        sourceId: record.id,
        payload: { correct, category: question?.category ?? null },
      }),
    );

    await this.progress.unlockEligibleAchievements(input.userId, "quiz_completed");
    return { id: record.id, correct, explanation: question?.explanation ?? null };
  }
}
