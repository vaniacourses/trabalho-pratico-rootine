import { Controller, Post, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { Flashcard } from "../entities/flashcard.entity";
import { MissionPattern } from "../entities/mission-pattern.entity";
import { QuizQuestion } from "../entities/quiz-question.entity";

@Controller("admin")
export class AdminController {
  private readonly logger = new Logger("ADMIN");

  constructor(private readonly em: EntityManager) {}

  /**
   * Corrige a divergência de schema: várias tabelas têm a coluna `id` como
   * uuid NOT NULL mas SEM `DEFAULT gen_random_uuid()`. Como o MikroORM omite o
   * `id` do INSERT (confiando no default do banco), o Postgres insere null e
   * viola o NOT NULL. Este endpoint aplica o default em todas as tabelas.
   */
  @Post("fix-schema")
  async fixSchema() {
    const tables = [
      "biosphere_posts",
      "guilds",
      "impact_ledger",
      "habitat_leaves",
      "quiz_questions",
      "user_daily_flashcards",
      "user_profile_events",
      "xp_ledger",
      "guild_members",
      "user_missions",
      "user_quiz_answers",
      "user_achievements",
      "agent_interactions",
      "flashcards",
      "mission_generation_logs",
      "quizzes",
      "user_flashcards_answers",
      "user_profile_facts",
    ];

    const conn = this.em.getConnection();
    const fixed: string[] = [];
    const failed: { table: string; error: string }[] = [];

    try {
      await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    } catch (e) {
      this.logger.warn(`Não foi possível garantir pgcrypto: ${(e as Error)?.message}`);
    }

    for (const table of tables) {
      try {
        await conn.execute(
          `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();`,
        );
        fixed.push(table);
        this.logger.log(`Default gen_random_uuid() aplicado em ${table}`);
      } catch (e) {
        const error = (e as Error)?.message || String(e);
        failed.push({ table, error });
        this.logger.error(`Falha ao alterar ${table}: ${error}`);
      }
    }

    return { success: failed.length === 0, fixed, failed };
  }

  @Post("seed-all")
  async seedAll() {
    try {
      const seedFlashcards = await this.seedFlashcards();
      const seedMissions = await this.seedMissionPatterns();
      const seedQuizzes = await this.seedQuizzes();

      return {
        success: true,
        message: "Seeding completed",
        results: { flashcards: seedFlashcards, missions: seedMissions, quizzes: seedQuizzes },
      };
    } catch (error) {
      this.logger.error(`Erro ao fazer seeding: ${error?.message}`);
      return { success: false, error: error?.message || String(error) };
    }
  }

  private async seedFlashcards(): Promise<{ created: number; skipped: number }> {
    const count = await this.em.count(Flashcard);
    if (count > 0) return { created: 0, skipped: count };

    const flashcardsData = [
      { question: 'Separo resíduos recicláveis em casa com frequência.', category: 'waste', signalKey: 'recycling_habit', signalType: 'behavior', weight: 1.0, difficulty: 1 },
      { question: 'Levo sacola reutilizável quando vou ao mercado.', category: 'consumption', signalKey: 'reusable_bags', signalType: 'behavior', weight: 1.0, difficulty: 1 },
      { question: 'Evito deixar a torneira aberta enquanto escovo os dentes.', category: 'water', signalKey: 'water_conservation', signalType: 'behavior', weight: 1.0, difficulty: 1 },
      { question: 'Desligo luzes ao sair de cômodos vazios.', category: 'energy', signalKey: 'lighting_habits', signalType: 'behavior', weight: 1.0, difficulty: 1 },
      { question: 'Prefiro transporte público ou caminhada quando possível.', category: 'transport', signalKey: 'public_transport', signalType: 'behavior', weight: 1.0, difficulty: 1 },
      { question: 'Planejo compras para reduzir desperdício de alimentos.', category: 'food', signalKey: 'food_planning', signalType: 'behavior', weight: 1.0, difficulty: 1 },
    ];

    const flashcards = flashcardsData.map((data) =>
      this.em.create(Flashcard, {
        ...data,
        trueEffect: { impact: "positive", value: 5 },
        falseEffect: {},
        skipEffect: {},
        active: true,
      })
    );

    await this.em.persistAndFlush(flashcards);
    this.logger.log(`Seeded ${flashcards.length} flashcards`);
    return { created: flashcards.length, skipped: 0 };
  }

  private async seedMissionPatterns(): Promise<{ created: number; skipped: number }> {
    const count = await this.em.count(MissionPattern);
    if (count > 0) return { created: 0, skipped: count };

    const patternsData = [
      {
        key: "waste_sorting",
        category: "waste",
        environmentalGoal: "Reduzir resíduos",
        difficultyMin: 1,
        difficultyMax: 2,
        costLevel: "free",
        effortMinutesMin: 5,
        effortMinutesMax: 15,
        impactModelKey: "waste_reduction",
        fallbackTitlePt: "Organize a coleta seletiva",
        fallbackDescriptionPt: "Separe resíduos recicláveis",
        fallbackReasonPt: "Redução de resíduos",
      },
      {
        key: "water_conservation",
        category: "water",
        environmentalGoal: "Economizar água",
        difficultyMin: 1,
        difficultyMax: 2,
        costLevel: "free",
        effortMinutesMin: 5,
        effortMinutesMax: 10,
        impactModelKey: "water_conservation",
        fallbackTitlePt: "Economize água",
        fallbackDescriptionPt: "Reduza consumo de água",
        fallbackReasonPt: "Preservação de água",
      },
    ];

    const patterns = patternsData.map((data) =>
      this.em.create(MissionPattern, {
        ...data,
        active: true,
        requiredOrHelpfulFactTypes: [],
        disqualifyingFactKeys: [],
        personalizationSlots: [],
        recurrenceAllowed: false,
      })
    );

    await this.em.persistAndFlush(patterns);
    this.logger.log(`Seeded ${patterns.length} mission patterns`);
    return { created: patterns.length, skipped: 0 };
  }

  private async seedQuizzes(): Promise<{ created: number; skipped: number }> {
    const count = await this.em.count(QuizQuestion);
    if (count > 0) return { created: 0, skipped: count };

    const quizzesData = [
      {
        question: "Qual é o primeiro passo para reduzir resíduos?",
        options: [
          { id: "a", text: "Reciclar tudo" },
          { id: "b", text: "Reduzir o consumo" },
          { id: "c", text: "Queimar lixo" },
        ],
        correctOption: "b",
        explanation: "Reduzir o consumo é o primeiro passo do 3Rs",
        category: "waste",
        difficulty: 1,
        signalKey: "waste_knowledge",
      },
    ];

    const quizzes = quizzesData.map((data) =>
      this.em.create(QuizQuestion, {
        ...data,
        active: true,
      })
    );

    await this.em.persistAndFlush(quizzes);
    this.logger.log(`Seeded ${quizzes.length} quiz questions`);
    return { created: quizzes.length, skipped: 0 };
  }
}
