import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import {
  aggregateImpactRows,
  asObject,
  canonicalImpactEstimate,
  getLevelFromXp,
  IMPACT_METRIC_KEYS,
  IMPACT_MODEL_VERSION,
  IMPACT_UNITS,
  numberValue,
  PROGRESS_ALGORITHM_VERSION,
  PROGRESS_SCHEMA_VERSION,
  startOfUtcDay,
} from "../domain";
import { XpLedger } from "../entities/xp-ledger.entity";
import { ImpactLedger } from "../entities/impact-ledger.entity";
import { Profile } from "../entities/profile.entity";
import { UserMission } from "../entities/user-mission.entity";
import { MissionPattern } from "../entities/mission-pattern.entity";
import { AchievementDefinition } from "../entities/achievement-definition.entity";
import { UserAchievement } from "../entities/user-achievement.entity";
import { UserProfileEvent } from "../entities/user-profile-event.entity";

export interface XpAwardResult {
  xpGranted: number;
  capped: boolean;
  alreadyAwarded: boolean;
  ledgerId: string | null;
  totalXp: number;
  level: number;
}

/**
 * Porte de `_shared/progress.ts` para MikroORM. Preserva as invariantes:
 * idempotência de XP/impacto, curva de XP fixa, conquistas determinísticas e os
 * prefixos de log (`[XP]`, `[IMPACT]`, `[HABITAT]`).
 */
@Injectable()
export class ProgressService {
  private readonly logger = new Logger("PROGRESS");

  constructor(private readonly em: EntityManager) {}

  async recalculateProfileXp(userId: string): Promise<number> {
    const rows = await this.em.find(XpLedger, { userId });
    const totalXp = rows.reduce((sum, row) => sum + Math.max(0, numberValue(row.xpDelta, 0)), 0);
    await this.em.nativeUpdate(Profile, { id: userId }, { xp: totalXp });
    const level = getLevelFromXp(totalXp);
    this.logger.log(
      `[HABITAT] Cache de nivel recalculado. user=${userId} total_xp=${totalXp} level=${level.level}`,
    );
    return totalXp;
  }

  private async getExistingXpAward(userId: string, idempotencyKey: string) {
    return this.em.findOne(XpLedger, { userId, idempotencyKey });
  }

  async awardXpLedger(input: {
    userId: string;
    sourceType: string;
    sourceId?: string | null;
    reason: string;
    requestedXp: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<XpAwardResult> {
    const requestedXp = Math.max(0, Math.floor(input.requestedXp));
    if (requestedXp <= 0) {
      const totalXp = await this.recalculateProfileXp(input.userId);
      return { xpGranted: 0, capped: false, alreadyAwarded: false, ledgerId: null, totalXp, level: getLevelFromXp(totalXp).level };
    }

    const existing = await this.getExistingXpAward(input.userId, input.idempotencyKey);
    if (existing) {
      const totalXp = await this.recalculateProfileXp(input.userId);
      return {
        xpGranted: numberValue(existing.xpDelta, 0),
        capped: false,
        alreadyAwarded: true,
        ledgerId: existing.id,
        totalXp,
        level: getLevelFromXp(totalXp).level,
      };
    }

    const ledger = this.em.create(XpLedger, {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      reason: input.reason,
      xpDelta: requestedXp,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        ...(input.metadata ?? {}),
        schema_version: PROGRESS_SCHEMA_VERSION,
        algorithm: PROGRESS_ALGORITHM_VERSION,
      },
    });

    try {
      await this.em.persistAndFlush(ledger);
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        const duplicate = await this.getExistingXpAward(input.userId, input.idempotencyKey);
        const totalXp = await this.recalculateProfileXp(input.userId);
        return {
          xpGranted: numberValue(duplicate?.xpDelta, 0),
          capped: false,
          alreadyAwarded: true,
          ledgerId: duplicate?.id ?? null,
          totalXp,
          level: getLevelFromXp(totalXp).level,
        };
      }
      throw error;
    }

    const totalXp = await this.recalculateProfileXp(input.userId);
    this.logger.log(`[XP] Lancamento registrado. user=${input.userId} xp_delta=${requestedXp} total_xp=${totalXp}`);
    return {
      xpGranted: requestedXp,
      capped: false,
      alreadyAwarded: false,
      ledgerId: ledger.id,
      totalXp,
      level: getLevelFromXp(totalXp).level,
    };
  }

  async awardXpWithDailyCap(input: {
    userId: string;
    sourceType: string;
    sourceId?: string | null;
    reason: string;
    requestedXp: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    dailyCap: number;
    dailyCapSourceTypes?: string[];
  }): Promise<XpAwardResult> {
    const existing = await this.getExistingXpAward(input.userId, input.idempotencyKey);
    if (existing) {
      const totalXp = await this.recalculateProfileXp(input.userId);
      return {
        xpGranted: numberValue(existing.xpDelta, 0),
        capped: false,
        alreadyAwarded: true,
        ledgerId: existing.id,
        totalXp,
        level: getLevelFromXp(totalXp).level,
      };
    }

    const requestedXp = Math.max(0, Math.floor(input.requestedXp));
    if (requestedXp <= 0) {
      const totalXp = await this.recalculateProfileXp(input.userId);
      return { xpGranted: 0, capped: false, alreadyAwarded: false, ledgerId: null, totalXp, level: getLevelFromXp(totalXp).level };
    }

    const todayRows = await this.em.find(XpLedger, {
      userId: input.userId,
      sourceType: { $in: input.dailyCapSourceTypes ?? [input.sourceType] },
      createdAt: { $gte: new Date(startOfUtcDay()) },
    });
    const currentDailyXp = todayRows.reduce((sum, row) => sum + Math.max(0, numberValue(row.xpDelta, 0)), 0);
    const remaining = Math.max(0, input.dailyCap - currentDailyXp);
    const xpGranted = Math.min(requestedXp, remaining);

    if (xpGranted <= 0) {
      const totalXp = await this.recalculateProfileXp(input.userId);
      this.logger.log(`[XP] Teto diario aplicado. user=${input.userId} daily_cap=${input.dailyCap}`);
      return { xpGranted: 0, capped: true, alreadyAwarded: false, ledgerId: null, totalXp, level: getLevelFromXp(totalXp).level };
    }

    const result = await this.awardXpLedger({
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reason: input.reason,
      requestedXp: xpGranted,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        ...(input.metadata ?? {}),
        requested_xp: requestedXp,
        daily_cap: input.dailyCap,
        daily_cap_source_types: input.dailyCapSourceTypes ?? [input.sourceType],
        capped: xpGranted < requestedXp,
      },
    });
    return { ...result, capped: xpGranted < requestedXp };
  }

  async logMissionImpact(userId: string, mission: UserMission): Promise<{ inserted: boolean; ledgerId: string | null; impact: Record<string, unknown> }> {
    const missionId = mission.id;
    if (!missionId) throw new Error("mission.id ausente para registrar impacto.");

    const idempotencyKey = `mission_impact:${missionId}`;
    const existing = await this.em.findOne(ImpactLedger, { userId, idempotencyKey });
    const patternKey = mission.patternKey?.trim() || null;
    const category = mission.category ?? "consumption";

    let impactModelKey = `${category}.default`;
    if (patternKey) {
      const pattern = await this.em.findOne(MissionPattern, { key: patternKey });
      impactModelKey = pattern?.impactModelKey?.trim() || `${patternKey}.impact`;
    }

    if (existing) {
      this.logger.log(`[IMPACT] Impacto idempotente reutilizado. mission=${missionId}`);
      return { inserted: false, ledgerId: existing.id, impact: asObject(existing.impact) };
    }

    const existingByMission = await this.em.findOne(ImpactLedger, { missionId });
    if (existingByMission) {
      this.logger.log(`[IMPACT] Impacto de missao reutilizado. mission=${missionId}`);
      return { inserted: false, ledgerId: existingByMission.id, impact: asObject(existingByMission.impact) };
    }

    const impact = canonicalImpactEstimate(mission.expectedImpact, category, mission.difficulty);
    const confidenceValues = IMPACT_METRIC_KEYS.map((metric) => numberValue((impact[metric] as any).confidence, 0.2));
    const confidence = Number((confidenceValues.reduce((sum, v) => sum + v, 0) / Math.max(1, confidenceValues.length)).toFixed(3));
    const loggedAt = mission.completedAt ?? new Date();

    const ledger = this.em.create(ImpactLedger, {
      userId,
      missionId,
      sourceType: "mission_completed",
      impact,
      estimated: true,
      confidence,
      idempotencyKey,
      loggedAt,
      patternKey,
      impactModelKey,
      modelVersion: IMPACT_MODEL_VERSION,
      metadata: {
        schema_version: PROGRESS_SCHEMA_VERSION,
        algorithm: PROGRESS_ALGORITHM_VERSION,
        category,
        units: IMPACT_UNITS,
        source: "mission_expected_impact",
      },
    });

    try {
      await this.em.persistAndFlush(ledger);
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        return this.logMissionImpact(userId, mission);
      }
      throw error;
    }

    await this.em.nativeUpdate(UserMission, { id: missionId, userId }, { impactLoggedAt: loggedAt });
    this.logger.log(`[IMPACT] Impacto registrado. mission=${missionId} model=${impactModelKey}`);
    return { inserted: true, ledgerId: ledger.id, impact };
  }

  async unlockEligibleAchievements(userId: string, source: string) {
    const [definitions, existingRows] = await Promise.all([
      this.em.find(AchievementDefinition, { active: true }),
      this.em.find(UserAchievement, { userId }),
    ]);
    const existing = new Set(existingRows.map((row) => row.achievementKey));
    const metrics = await this.achievementMetrics(userId);
    const unlocked: string[] = [];
    let unlockedXp = 0;

    for (const definition of definitions) {
      if (existing.has(definition.key) || !this.qualifiesForAchievement(definition.key, metrics)) continue;

      const xp = await this.awardXpLedger({
        userId,
        sourceType: "achievement",
        sourceId: null,
        reason: `Conquista: ${definition.title}`,
        requestedXp: Math.max(0, numberValue(definition.xpReward, 0)),
        idempotencyKey: `achievement:${definition.key}`,
        metadata: { achievement_key: definition.key, trigger_source: source },
      });

      const userAchievement = this.em.create(UserAchievement, {
        userId,
        achievementKey: definition.key,
        xpLedgerId: xp.ledgerId,
        metadata: {
          schema_version: PROGRESS_SCHEMA_VERSION,
          algorithm: PROGRESS_ALGORITHM_VERSION,
          trigger_source: source,
        },
      });

      try {
        await this.em.persistAndFlush(userAchievement);
        unlocked.push(definition.key);
        unlockedXp += xp.xpGranted;
        existing.add(definition.key);
        this.logger.log(`[XP] Conquista desbloqueada. user=${userId} achievement=${definition.key}`);
      } catch (error) {
        if (!(error instanceof UniqueConstraintViolationException)) throw error;
      }
    }

    return { unlocked, unlocked_xp: unlockedXp, metrics };
  }

  private async achievementMetrics(userId: string) {
    const [missions, events, impacts, xpRows] = await Promise.all([
      this.em.find(UserMission, { userId }),
      this.em.find(UserProfileEvent, { userId }, { orderBy: { occurredAt: "desc" }, limit: 1500 }),
      this.em.find(ImpactLedger, { userId }),
      this.em.find(XpLedger, { userId }),
    ]);

    const completedMissions = missions.filter((m) => m.status === "completed");
    const impactTotals = aggregateImpactRows(
      impacts.map((row) => ({ impact: row.impact, logged_at: row.loggedAt?.toISOString() ?? null })),
    ).total;
    const activeDays = new Set(
      events
        .map((event) => event.occurredAt?.toISOString().slice(0, 10) ?? null)
        .filter((day): day is string => Boolean(day)),
    );
    const categories = new Set<string>();
    for (const mission of completedMissions) if (mission.category) categories.add(mission.category);
    for (const event of events) {
      const category = asObject(event.payload).category;
      if (typeof category === "string") categories.add(category);
    }

    const totalXp = xpRows.reduce((sum, row) => sum + Math.max(0, numberValue(row.xpDelta, 0)), 0);

    return {
      completedMissions: completedMissions.length,
      missionDifficulty3: completedMissions.filter((m) => numberValue(m.difficulty, 0) >= 3).length,
      missionDifficulty4: completedMissions.filter((m) => numberValue(m.difficulty, 0) >= 4).length,
      activeDays: activeDays.size,
      categoriesTouched: categories.size,
      adventureBatchCount: events.filter((e) => e.eventType === "BATCH_COMPLETED").length,
      editCount: events.filter((e) => e.eventType === "FEEDBACK_SENT" && e.source === "mission_edit").length,
      feedbackCount: events.filter((e) => e.eventType === "FEEDBACK_SENT").length,
      onboardingCount: events.filter((e) => e.eventType === "ONBOARDING_COMPLETED").length,
      quizCorrectCount: events.filter((e) => e.eventType === "QUIZ_COMPLETED" && asObject(e.payload).correct === true).length,
      impactTotals,
      totalXp,
      level: getLevelFromXp(totalXp).level,
    };
  }

  private qualifiesForAchievement(key: string, metrics: Awaited<ReturnType<ProgressService["achievementMetrics"]>>) {
    switch (key) {
      case "onboarding_complete":
        return metrics.onboardingCount >= 1;
      case "first_mission_completed":
        return metrics.completedMissions >= 1;
      case "three_missions_completed":
        return metrics.completedMissions >= 3;
      case "five_missions_completed":
        return metrics.completedMissions >= 5;
      case "twenty_missions_completed":
        return metrics.completedMissions >= 20;
      case "first_adventure_batch":
        return metrics.adventureBatchCount >= 1;
      case "seven_active_days":
        return metrics.activeDays >= 7;
      case "four_categories_touched":
        return metrics.categoriesTouched >= 4;
      case "first_mission_edit":
        return metrics.editCount >= 1;
      case "first_feedback":
        return metrics.feedbackCount >= 1;
      case "quiz_streak_3":
        return metrics.quizCorrectCount >= 3;
      case "mission_difficulty_3":
        return metrics.missionDifficulty3 >= 1;
      case "mission_difficulty_4":
        return metrics.missionDifficulty4 >= 1;
      case "impact_water":
        return metrics.impactTotals.water_l > 0;
      case "impact_waste":
        return metrics.impactTotals.waste_g > 0;
      case "impact_co2_energy":
        return metrics.impactTotals.co2_kg > 0 || metrics.impactTotals.energy_kwh > 0;
      case "habitat_level_3":
        return metrics.level >= 3;
      default:
        return false;
    }
  }

  async getProgressSummary(userId: string) {
    const [xpRows, impacts] = await Promise.all([
      this.em.find(XpLedger, { userId }),
      this.em.find(ImpactLedger, { userId }),
    ]);
    const totalXp = xpRows.reduce((sum, row) => sum + Math.max(0, numberValue(row.xpDelta, 0)), 0);
    const level = getLevelFromXp(totalXp);
    const impactTotals = aggregateImpactRows(
      impacts.map((row) => ({ impact: row.impact, logged_at: row.loggedAt?.toISOString() ?? null })),
    );
    return { userId, totalXp, level, impact: impactTotals };
  }
}
