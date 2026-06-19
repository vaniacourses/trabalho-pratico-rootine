import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import {
  buildOnboardingAffinities,
  buildOnboardingLearnedPreferences,
  buildOnboardingSocioeconomicContext,
  deriveOnboardingFacts,
  normalizeOnboardingAnswers,
  type OnboardingAnswers,
  validateOnboardingAnswers,
} from "../domain";
import { Profile } from "../entities/profile.entity";
import { UserProfileEvent } from "../entities/user-profile-event.entity";
import { UserProfileFact } from "../entities/user-profile-fact.entity";
import { ProgressService } from "../progress/progress.service";

/** Porte de `complete-onboarding`: determinístico, sem IA. */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger("BRAIN");

  constructor(
    private readonly em: EntityManager,
    private readonly progress: ProgressService,
  ) {}

  async complete(userId: string, rawAnswers: Record<string, unknown>, nome?: string) {
    const answers = normalizeOnboardingAnswers(rawAnswers);
    const validation = validateOnboardingAnswers(answers);
    if (!validation.valid) {
      throw new BadRequestException({ error: "invalid_onboarding_answers", details: validation.errors });
    }

    const completeAnswers = answers as Required<OnboardingAnswers>;
    const generatedAt = new Date().toISOString();
    const socioeconomicContext = buildOnboardingSocioeconomicContext(completeAnswers, generatedAt);
    const affinities = buildOnboardingAffinities(completeAnswers);
    const learnedPreferences = buildOnboardingLearnedPreferences(completeAnswers, generatedAt);
    const derivedFacts = deriveOnboardingFacts(completeAnswers);

    let profile = await this.em.findOne(Profile, { id: userId });
    if (!profile) {
      profile = this.em.create(Profile, { id: userId, xp: 1, impactTotals: { co2_kg: 0, water_l: 0, waste_g: 0 } });
    }
    profile.nome = profile.nome ?? nome ?? null;
    profile.name = profile.name ?? nome ?? null;
    profile.socioeconomicContext = socioeconomicContext;
    profile.affinities = affinities;
    profile.learnedPreferences = learnedPreferences;
    profile.onboardingCompleted = true;
    await this.em.persistAndFlush(profile);

    // Evento imutável (fonte de verdade) + derivação de fatos.
    const answeredEvent = this.em.create(UserProfileEvent, {
      userId,
      eventType: "ONBOARDING_ANSWERED",
      source: "onboarding",
      payload: { answers: completeAnswers },
    });
    await this.em.persistAndFlush(answeredEvent);

    for (const fact of derivedFacts) {
      await this.upsertFact(userId, fact, answeredEvent.id);
    }

    await this.em.persistAndFlush(
      this.em.create(UserProfileEvent, {
        userId,
        eventType: "ONBOARDING_COMPLETED",
        source: "onboarding",
        payload: { fact_count: derivedFacts.length },
      }),
    );

    const achievements = await this.progress.unlockEligibleAchievements(userId, "onboarding_completed");
    this.logger.log(`[BRAIN] Onboarding concluido. user=${userId} facts=${derivedFacts.length}`);

    return { userId, affinities, derivedFacts: derivedFacts.length, achievements };
  }

  private async upsertFact(
    userId: string,
    fact: ReturnType<typeof deriveOnboardingFacts>[number],
    sourceEventId: string,
  ) {
    const existing = await this.em.findOne(UserProfileFact, { userId, factKey: fact.fact_key });
    if (existing) {
      existing.factType = fact.fact_type;
      existing.category = fact.category;
      existing.value = fact.value;
      existing.confidence = fact.confidence;
      existing.active = true;
      existing.lastSeenAt = new Date();
      existing.sourceEventIds = [...new Set([...(existing.sourceEventIds ?? []), sourceEventId])];
      await this.em.persistAndFlush(existing);
      return;
    }

    const created = this.em.create(UserProfileFact, {
      userId,
      factKey: fact.fact_key,
      factType: fact.fact_type,
      category: fact.category,
      value: fact.value,
      confidence: fact.confidence,
      active: true,
      derivedBy: "deterministic",
      sourceEventIds: [sourceEventId],
    });
    try {
      await this.em.persistAndFlush(created);
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) throw error;
    }
  }
}
