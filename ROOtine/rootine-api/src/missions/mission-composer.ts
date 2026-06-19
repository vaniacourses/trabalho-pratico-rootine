import { Injectable } from "@nestjs/common";
import {
  canonicalImpactEstimate,
  getMissionXpReward,
  type MissionCandidate,
  type ProfileFact,
} from "../domain";
import { MissionPattern } from "../entities/mission-pattern.entity";
import { Profile } from "../entities/profile.entity";

export type MissionType = "daily" | "specialized";

/**
 * Responsabilidade ÚNICA (SRP): a composição determinística de candidatos a
 * missão — ranquear patterns, transformá-los em candidatos e produzir o
 * candidato de cold start. Não toca em banco, IA, logs ou HTTP.
 *
 * Foi extraído de `MissionsService`, que antes misturava este algoritmo com
 * acesso a dados, orquestração de IA e persistência. Agora `MissionsService`
 * coordena, e este serviço é a "fonte da verdade" do algoritmo determinístico.
 */
@Injectable()
export class MissionComposer {
  /**
   * Escolhe o melhor pattern para o tipo pedido; delega a afinidade ao próprio
   * pattern e soma um viés de magnitude conforme `missionType`.
   */
  rankPattern(
    patterns: MissionPattern[],
    facts: ProfileFact[],
    recentPatternKeys: string[],
    profile: Profile | null,
    missionType: MissionType,
  ): MissionPattern | null {
    const available = patterns.filter((p) => !recentPatternKeys.includes(p.key));
    const pool = available.length > 0 ? available : patterns;
    if (pool.length === 0) return null;

    const affinities = (profile?.affinities ?? {}) as Record<string, number>;
    const factTypes = new Set(facts.map((f) => f.fact_type));
    const disqualifyingKeys = new Set(facts.map((f) => f.fact_key));

    const scored = pool
      .filter((pattern) => !pattern.isDisqualifiedBy(disqualifyingKeys))
      .map((pattern) => ({
        pattern,
        score: pattern.affinityScore(affinities, factTypes) + this.magnitudeBias(pattern, missionType),
      }))
      .sort((a, b) => b.score - a.score);

    return scored[0]?.pattern ?? pool[0];
  }

  /**
   * Viés de magnitude por tipo de missão. Domina a afinidade (~0–1.5) para que a
   * natureza do tipo prevaleça na seleção:
   * - `specialized` (semanal): favorece patterns de alto teto de dificuldade e
   *   esforço — ações estruturais, ex.: protocolos de 7 dias.
   * - `daily` (diária): favorece ações pequenas, recorrentes e de baixo esforço,
   *   aplicáveis ainda hoje na rotina.
   */
  private magnitudeBias(pattern: MissionPattern, missionType: MissionType): number {
    if (missionType === "specialized") {
      let bias = 0;
      if (pattern.difficultyMax >= 4) bias += 2;
      else if (pattern.difficultyMax >= 3) bias += 1;
      if (pattern.effortMinutesMax >= 20) bias += 0.5;
      return bias;
    }
    let bias = 0;
    if (pattern.difficultyMin <= 2) bias += 1;
    if (pattern.recurrenceAllowed) bias += 0.75;
    if (pattern.effortMinutesMin <= 10) bias += 0.5;
    return bias;
  }

  /** Constrói um candidato determinístico a partir de um pattern e dos fatos. */
  patternToCandidate(pattern: MissionPattern, facts: ProfileFact[], missionType: MissionType): MissionCandidate {
    const usableFacts = facts
      .filter((f) => pattern.requiredOrHelpfulFactTypes.includes(f.fact_type))
      .map((f) => f.fact_key)
      .slice(0, 3);
    const usedFactKeys = usableFacts.length > 0 ? usableFacts : ["cold_start.onboarding_completed"];

    // Diária usa o piso do pattern (ação pequena para hoje); semanal usa o teto
    // (ação de maior magnitude para a semana).
    const isWeekly = missionType === "specialized";
    const difficulty = isWeekly ? pattern.difficultyMax : pattern.difficultyMin;
    const effortMinutes = isWeekly ? pattern.effortMinutesMax : pattern.effortMinutesMin;

    return {
      title: pattern.fallbackTitlePt,
      description: pattern.fallbackDescriptionPt,
      category: pattern.category as MissionCandidate["category"],
      environmental_goal: pattern.environmentalGoal,
      difficulty,
      effort_minutes: effortMinutes,
      cost_level: pattern.costLevel as MissionCandidate["cost_level"],
      used_fact_keys: usedFactKeys,
      personalization_reason: pattern.fallbackReasonPt,
      expected_impact: canonicalImpactEstimate({}, pattern.category, difficulty) as unknown as MissionCandidate["expected_impact"],
      pattern_key: pattern.key,
      mission_type: missionType,
      xp_reward: getMissionXpReward(difficulty),
    };
  }

  /** Candidato usado quando não há pattern elegível (poucos fatos ativos). */
  coldStartCandidate(missionType: MissionType): MissionCandidate {
    if (missionType === "specialized") {
      // Semanal de cold start: ação estruturante de maior magnitude para a semana.
      return {
        title: "Mapa semanal de desperdicio da casa",
        description:
          "Durante 7 dias, observe e anote os principais pontos de desperdicio (agua, energia, lixo) e desenhe um plano simples para reduzir o maior deles ate o fim da semana.",
        category: "waste",
        environmental_goal: "reduce_waste_through_weekly_plan",
        difficulty: 3,
        effort_minutes: 30,
        cost_level: "free",
        used_fact_keys: ["cold_start.onboarding_completed"],
        personalization_reason:
          "Como ainda ha poucos fatos ativos, a missao semanal comeca por um diagnostico amplo que orienta acoes maiores nas proximas semanas.",
        expected_impact: canonicalImpactEstimate({}, "waste", 3) as unknown as MissionCandidate["expected_impact"],
        pattern_key: null,
        mission_type: missionType,
        xp_reward: getMissionXpReward(3),
      };
    }
    return {
      title: "Primeiro ponto de observacao de consumo",
      description:
        "Observe por 3 minutos onde aparece mais desperdicio na sua rotina de hoje e registre um ajuste possivel para reduzir.",
      category: "waste",
      environmental_goal: "reduce_waste_through_observation",
      difficulty: 1,
      effort_minutes: 3,
      cost_level: "free",
      used_fact_keys: ["cold_start.onboarding_completed"],
      personalization_reason:
        "Como ainda ha poucos fatos ativos, comeca observando a rotina sem impor custo ou esforco extra.",
      expected_impact: canonicalImpactEstimate({}, "waste", 1) as unknown as MissionCandidate["expected_impact"],
      pattern_key: null,
      mission_type: missionType,
      xp_reward: getMissionXpReward(1),
    };
  }

  /** Conveniência: ranqueia e já devolve o candidato determinístico resultante. */
  buildDeterministicCandidate(
    patterns: MissionPattern[],
    facts: ProfileFact[],
    recentPatternKeys: string[],
    profile: Profile | null,
    missionType: MissionType,
  ): { candidate: MissionCandidate; selectedPattern: MissionPattern | null } {
    const selectedPattern = this.rankPattern(patterns, facts, recentPatternKeys, profile, missionType);
    const candidate = selectedPattern
      ? this.patternToCandidate(selectedPattern, facts, missionType)
      : this.coldStartCandidate(missionType);
    return { candidate, selectedPattern };
  }
}
