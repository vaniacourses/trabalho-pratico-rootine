import { Body, Controller, Post, UseGuards, Get, Query } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { JwtUserGuard } from "../common/guards/jwt-user.guard";
import { OnboardingService } from "../onboarding/onboarding.service";
import { MissionsService } from "../missions/missions.service";
import { FlashcardService } from "../content/flashcard.service";
import { QuizService } from "../content/quiz.service";
import { HabitatService } from "../habitat/habitat.service";
import { ProfileService } from "../profile/profile.service";
import { NewsService } from "../news/news.service";
import { UserMission } from "../entities/user-mission.entity";

/**
 * Camada de compatibilidade: expõe os mesmos "nomes" das antigas Supabase Edge
 * Functions em `POST /fn/:nome`, devolvendo shapes que o app Expo já consome.
 * Internamente reaproveita os services de domínio do NestJS.
 *
 * O `JwtUserGuard` valida o Bearer token e exige que `body.userId` coincida com
 * o usuário autenticado (mesma invariante das Edge Functions).
 */
interface CompatBody {
  userId: string;
  answers?: Record<string, unknown>;
  nome?: string;
  missionType?: string;
  missionId?: string;
  clientRequestId?: string;
  generationRequestId?: string;
  userInput?: string;
  event_type?: string;
  missionAction?: string;
  batchId?: string;
  answerId?: string;
  answer?: boolean | null;
  quizId?: string;
  quizQuestionId?: string;
  selectedOption?: string;
  message?: string;
}

@Controller("fn")
export class CompatController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly missions: MissionsService,
    private readonly flashcards: FlashcardService,
    private readonly quizzes: QuizService,
    private readonly habitat: HabitatService,
    private readonly profile: ProfileService,
    private readonly news: NewsService,
    private readonly em: EntityManager,
  ) {}

  /**
   * Feed da Biosfera: notícias e eventos ambientais reais de Niterói / RJ via
   * Google Notícias. Público (sem auth) — o app consome em `invokeFunction`.
   */
  @Post("biosphere-feed")
  async biosphereFeed() {
    return this.news.getBiosphereFeed();
  }

  @Get("news-environment")
  async getEnvironmentalNews(
    @Query("limit") limit?: string,
  ) {
    return this.news.getEnvironmentalNews({ limit: limit ? Number(limit) : 10 });
  }

  @Get("news-events")
  async getEnvironmentalEvents(
    @Query("limit") limit?: string,
  ) {
    return this.news.getEnvironmentalEvents(limit ? Number(limit) : 5);
  }

  @UseGuards(JwtUserGuard)
  @Post("complete-onboarding")
  async completeOnboarding(@Body() body: CompatBody) {
    const result = await this.onboarding.complete(body.userId, body.answers ?? {}, body.nome);
    return {
      success: true,
      onboarding_completed: true,
      fact_count: result.derivedFacts,
      event_count: result.derivedFacts + 1,
      achievements: result.achievements,
    };
  }

  @UseGuards(JwtUserGuard)
  @Post("generate-missions")
  async generateMissions(@Body() body: CompatBody) {
    const missionType = body.missionType === "specialized" ? "specialized" : "daily";
    const activeCount = await this.em.count(UserMission, { userId: body.userId, status: "active" });
    if (activeCount >= 4) {
      return { success: true, message: "max_missions_reached" };
    }
    const requestId = body.clientRequestId ?? body.generationRequestId;
    const mission = await this.missions.generate(body.userId, missionType, requestId);
    return {
      success: true,
      message: "mission_created",
      mission_id: mission.id,
      client_request_id: requestId ?? null,
      pattern_key: mission.patternKey ?? null,
    };
  }

  @UseGuards(JwtUserGuard)
  @Post("edit-mission")
  async editMission(@Body() body: CompatBody) {
    if (!body.missionId) {
      return { success: false, error: "missionId_required" };
    }
    await this.missions.edit(body.userId, body.missionId, body.userInput ?? "");
    return { success: true, message: "mission_edited", issue_type: null, fallback_reason: null };
  }

  @UseGuards(JwtUserGuard)
  @Post("sync-user-brain")
  async syncBrain(@Body() body: CompatBody) {
    const completed =
      body.event_type === "MISSION_ACTION" &&
      String(body.missionAction ?? "").toUpperCase() === "COMPLETED" &&
      Boolean(body.missionId);

    if (completed && body.missionId) {
      const result = await this.missions.complete(body.userId, body.missionId);
      return {
        success: true,
        event_type: body.event_type,
        xp: result.xp,
        impact: result.impact,
        achievements: result.achievements,
      };
    }

    const caches = await this.profile.syncBrain(body.userId).catch(() => null);
    return {
      success: true,
      event_type: body.event_type ?? null,
      xp: null,
      impact: null,
      achievements: { unlocked: [], unlocked_xp: 0 },
      caches,
    };
  }

  @UseGuards(JwtUserGuard)
  @Post("generate-batch")
  async generateBatch(@Body() body: CompatBody) {
    const batch = await this.flashcards.generateAdventureBatch(body.userId);
    return { success: true, ...batch };
  }

  @UseGuards(JwtUserGuard)
  @Post("answer-adventure-card")
  async answerCard(@Body() body: CompatBody) {
    if (!body.answerId) return { success: false, error: "answerId_required" };
    await this.flashcards.answerByAnswerId(body.userId, body.answerId, body.answer ?? null);
    return { success: true };
  }

  @UseGuards(JwtUserGuard)
  @Post("complete-adventure-batch")
  async completeBatch(@Body() body: CompatBody) {
    if (!body.batchId) return { success: false, error: "batchId_required" };
    const result = await this.flashcards.completeBatch(body.userId, body.batchId);
    return { success: true, xp: result.xp };
  }

  @UseGuards(JwtUserGuard)
  @Post("generate-quiz")
  async generateQuiz(@Body() body: CompatBody) {
    const quiz = await this.quizzes.generateAdventure(body.userId);
    return { success: true, quiz };
  }

  @UseGuards(JwtUserGuard)
  @Post("answer-adventure-quiz")
  async answerQuiz(@Body() body: CompatBody) {
    if (!body.quizQuestionId || !body.selectedOption) {
      return { success: false, error: "quiz_payload_required" };
    }
    const result = await this.quizzes.answer({
      userId: body.userId,
      quizQuestionId: body.quizQuestionId,
      selectedOption: body.selectedOption,
    });
    return { success: true, correct: result.correct, explanation: result.explanation };
  }

  @UseGuards(JwtUserGuard)
  @Post("habitat-leaves")
  async habitatLeaves(@Body() body: CompatBody) {
    let habitat = await this.habitat.getHabitat(body.userId);
    if (habitat.leaves.length === 0) {
      await this.habitat.generateLeaves(body.userId).catch(() => null);
      habitat = await this.habitat.getHabitat(body.userId);
    }
    return { success: true, leaves: habitat.leaves, level: habitat.level, health: habitat.health };
  }

  @UseGuards(JwtUserGuard)
  @Post("profile-scientist-chat")
  async scientistChat(@Body() body: CompatBody) {
    const result = await this.profile.scientistChat(body.userId, body.message ?? "");
    return {
      success: true,
      answer: result.answer,
      protocols: [],
      fallback_reason: result.fallback_reason,
    };
  }
}
