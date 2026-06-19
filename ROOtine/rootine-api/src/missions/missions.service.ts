import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import {
  getLevelFromXp,
  getMissionXpReward,
  type MissionCandidate,
  type MissionValidationOptions,
  type ProfileFact,
  validateMissionCandidate,
} from "../domain";
import { MissionComposer } from "./mission-composer";
import { UserMission } from "../entities/user-mission.entity";
import { MissionPattern } from "../entities/mission-pattern.entity";
import { MissionGenerationLog } from "../entities/mission-generation-log.entity";
import { UserProfileFact } from "../entities/user-profile-fact.entity";
import { Profile } from "../entities/profile.entity";
import { UserProfileEvent } from "../entities/user-profile-event.entity";
import { AGENT_PROVIDERS } from "../agents/agents.tokens";
import { GuardianAgent } from "../agents/guardian/guardian.agent";
import { AgentInteractionLogger } from "../common/logging/agent-interaction.service";
import { ProgressService } from "../progress/progress.service";

/**
 * Porte de `generate-missions` / `edit-mission` (Guardião — diagrama).
 * Fluxo principal funciona SEM IA: ranking determinístico de patterns +
 * candidato determinístico + validadores. A IA (Guardião) só refina texto e o
 * resultado é re-validado antes de salvar.
 */
@Injectable()
export class MissionsService {
  private readonly logger = new Logger("MISSION_GEN");

  constructor(
    private readonly em: EntityManager,
    private readonly progress: ProgressService,
    private readonly agentLogger: AgentInteractionLogger,
    private readonly composer: MissionComposer,
    @Inject(AGENT_PROVIDERS.Guardian) private readonly guardian: GuardianAgent,
  ) {}

  async generate(userId: string, missionType: "daily" | "specialized" = "daily", generationRequestId?: string) {
    if (generationRequestId) {
      const existing = await this.em.findOne(UserMission, { userId, generationRequestId });
      if (existing) {
        this.logger.log(`[MISSION_GEN] Reuso idempotente. request=${generationRequestId}`);
        return existing;
      }
    }

    const profile = await this.em.findOne(Profile, { id: userId });
    const userLevel = getLevelFromXp(profile?.xp ?? 0).level;

    const factRows = await this.em.find(UserProfileFact, { userId, active: true });
    const facts: ProfileFact[] = factRows.map((row) => ({
      fact_key: row.factKey,
      fact_type: row.factType as ProfileFact["fact_type"],
      category: (row.category as ProfileFact["category"]) ?? null,
      value: row.value,
      confidence: row.confidence,
      active: row.active,
    }));

    const recentMissions = await this.em.find(
      UserMission,
      { userId },
      { orderBy: { createdAt: "desc" }, limit: 10 },
    );
    const recentMissionTexts = recentMissions.map((m) => `${m.title} ${m.description}`);
    const recentPatternKeys = recentMissions
      .filter((m) => m.status === "refused" || m.status === "failed" || m.status === "active")
      .map((m) => m.patternKey)
      .filter((key): key is string => Boolean(key));

    const options: MissionValidationOptions = { facts, userLevel, recentMissionTexts, recentPatternKeys };

    const patterns = await this.em.find(MissionPattern, { active: true });
    const { candidate: deterministicCandidate, selectedPattern } = this.composer.buildDeterministicCandidate(
      patterns,
      facts,
      recentPatternKeys,
      profile,
      missionType,
    );

    // IA (Guardião) apenas refina o texto; re-validamos o retorno.
    let finalCandidate = deterministicCandidate;
    let aiUsed = false;
    let fallbackReason: string | undefined;

    try {
      const enhanced = await this.guardian.customizarDesafios(deterministicCandidate, {
        facts: facts.map((f) => f.fact_key),
        userLevel,
        missionType,
        cadence: missionType === "specialized" ? "weekly" : "daily",
      });
      aiUsed = !enhanced._fallback_reason;
      fallbackReason = enhanced._fallback_reason;
      const reconciled: MissionCandidate = {
        ...deterministicCandidate,
        title: enhanced.title ?? deterministicCandidate.title,
        description: enhanced.description ?? deterministicCandidate.description,
        personalization_reason: enhanced.personalization_reason ?? deterministicCandidate.personalization_reason,
      };
      const validation = validateMissionCandidate(reconciled, options);
      finalCandidate = validation.valid ? reconciled : deterministicCandidate;
      if (!validation.valid) {
        fallbackReason = fallbackReason ?? "ai_candidate_invalid";
        this.logger.warn(`[MISSION_GEN] Candidato IA rejeitado: ${validation.errors.join(",")}`);
      }
    } catch (error) {
      finalCandidate = deterministicCandidate;
      fallbackReason = "ai_exception";
      this.logger.warn(`[MISSION_GEN] IA indisponivel, usando candidato deterministico: ${error}`);
    }

    const finalValidation = validateMissionCandidate(finalCandidate, options);
    const usedFallback = !finalValidation.valid || !aiUsed;

    // Diária expira em 24h (ação para hoje); semanal em 7 dias (ação de maior
    // magnitude para a semana). O app marca como `failed` após `expiresAt`.
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (missionType === "specialized" ? 7 : 1) * 24 * 60 * 60 * 1000,
    );

    const mission = this.em.create(UserMission, {
      userId,
      title: finalCandidate.title,
      description: finalCandidate.description,
      status: "active",
      missionType,
      createdAt: now,
      expiresAt,
      category: finalCandidate.category,
      environmentalGoal: finalCandidate.environmental_goal,
      difficulty: finalCandidate.difficulty,
      effortMinutes: finalCandidate.effort_minutes,
      costLevel: finalCandidate.cost_level,
      xpReward: getMissionXpReward(finalCandidate.difficulty),
      usedFactKeys: finalCandidate.used_fact_keys,
      personalizationReason: finalCandidate.personalization_reason,
      expectedImpact: finalCandidate.expected_impact as Record<string, unknown>,
      patternKey: selectedPattern?.key ?? null,
      actionFingerprint: selectedPattern?.actionFingerprint ?? null,
      generationRequestId: generationRequestId ?? null,
      aiJustification: {
        ai_used: aiUsed,
        ai_stage: "guardian_text_enhancement",
        fallback_reason: fallbackReason ?? null,
      },
      generationSnapshot: {
        algorithm: "hybrid_ai_mission_composer_v2",
        candidate_pattern_keys: patterns.map((p) => p.key),
        selected_pattern_key: selectedPattern?.key ?? null,
        used_fallback: usedFallback,
        validation_errors: finalValidation.errors,
      },
    });

    try {
      await this.em.persistAndFlush(mission);
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException && generationRequestId) {
        const existing = await this.em.findOne(UserMission, { userId, generationRequestId });
        if (existing) return existing;
      }
      throw error;
    }

    await this.em.persistAndFlush(
      this.em.create(MissionGenerationLog, {
        userId,
        missionId: mission.id,
        missionType,
        candidatePatternKeys: patterns.map((p) => p.key),
        selectedPatternKey: selectedPattern?.key ?? null,
        selectedActionFingerprint: selectedPattern?.actionFingerprint ?? null,
        validationErrors: finalValidation.errors,
        usedFallback,
        status: usedFallback ? "fallback" : "success",
        generationSnapshot: { ai_used: aiUsed, fallback_reason: fallbackReason ?? null },
      }),
    );

    await this.agentLogger.log({
      userId,
      agent: "guardian",
      eventType: "MISSION_GENERATED",
      inputSummary: { mission_type: missionType, user_level: userLevel, fact_count: facts.length },
      output: { mission_id: mission.id, ai_used: aiUsed, fallback_reason: fallbackReason ?? null },
    });

    this.logger.log(`[MISSION_GEN] Missao gerada. id=${mission.id} ai_used=${aiUsed} fallback=${usedFallback}`);
    return mission;
  }

  async list(userId: string, status?: string) {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    return this.em.find(UserMission, where, { orderBy: { createdAt: "desc" } });
  }

  async complete(userId: string, missionId: string) {
    const mission = await this.em.findOne(UserMission, { id: missionId, userId });
    if (!mission) throw new NotFoundException("mission_not_found");

    if (mission.status !== "completed") {
      mission.status = "completed";
      mission.completedAt = new Date();
      await this.em.persistAndFlush(mission);
    }

    const xp = await this.progress.awardXpLedger({
      userId,
      sourceType: "mission_completed",
      sourceId: mission.id,
      reason: `Missao concluida: ${mission.title}`,
      requestedXp: getMissionXpReward(mission.difficulty),
      idempotencyKey: `mission_completed:${mission.id}`,
      metadata: { mission_id: mission.id, category: mission.category },
    });

    const impact = await this.progress.logMissionImpact(userId, mission);
    const achievements = await this.progress.unlockEligibleAchievements(userId, "mission_completed");

    await this.em.persistAndFlush(
      this.em.create(UserProfileEvent, {
        userId,
        eventType: "MISSION_COMPLETED",
        source: "missions",
        sourceTable: "user_missions",
        sourceId: mission.id,
        payload: { category: mission.category, difficulty: mission.difficulty },
      }),
    );

    return { mission, xp, impact, achievements };
  }

  async refuse(userId: string, missionId: string) {
    const mission = await this.em.findOne(UserMission, { id: missionId, userId });
    if (!mission) throw new NotFoundException("mission_not_found");
    mission.status = "refused";
    await this.em.persistAndFlush(mission);
    return mission;
  }

  async edit(userId: string, missionId: string, feedback: string) {
    const mission = await this.em.findOne(UserMission, { id: missionId, userId });
    if (!mission) throw new NotFoundException("mission_not_found");

    const enhanced = await this.guardian.customizarDesafios(
      {
        title: mission.title,
        description: mission.description,
        category: (mission.category as MissionCandidate["category"]) ?? "consumption",
        environmental_goal: mission.environmentalGoal ?? "",
        difficulty: mission.difficulty ?? 1,
        effort_minutes: mission.effortMinutes ?? 5,
        cost_level: (mission.costLevel as MissionCandidate["cost_level"]) ?? "free",
        used_fact_keys: mission.usedFactKeys ?? [],
        personalization_reason: mission.personalizationReason ?? "",
        expected_impact: mission.expectedImpact as MissionCandidate["expected_impact"],
      },
      { feedback },
    );

    if (!enhanced._fallback_reason) {
      mission.title = enhanced.title ?? mission.title;
      mission.description = enhanced.description ?? mission.description;
      mission.personalizationReason = enhanced.personalization_reason ?? mission.personalizationReason;
    }
    mission.feedbackNotes = { last_feedback: feedback, ai_used: !enhanced._fallback_reason };
    await this.em.persistAndFlush(mission);

    await this.em.persistAndFlush(
      this.em.create(UserProfileEvent, {
        userId,
        eventType: "FEEDBACK_SENT",
        source: "mission_edit",
        sourceTable: "user_missions",
        sourceId: mission.id,
        payload: { feedback_length: feedback.length },
      }),
    );

    return mission;
  }
}
