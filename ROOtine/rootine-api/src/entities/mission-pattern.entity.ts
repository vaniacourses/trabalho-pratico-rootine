import { Entity, Opt, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "mission_patterns" })
export class MissionPattern {
  @PrimaryKey({ type: "string" })
  key!: string;

  @Property({ type: "string" })
  category!: string;

  @Property({ type: "string" })
  environmentalGoal!: string;

  @Property({ type: "integer" })
  difficultyMin!: number;

  @Property({ type: "integer" })
  difficultyMax!: number;

  @Property({ type: "string" })
  costLevel: string = "free";

  @Property({ type: "integer" })
  effortMinutesMin: number = 1;

  @Property({ type: "integer" })
  effortMinutesMax: number = 10;

  @Property({ type: "array" })
  requiredOrHelpfulFactTypes: string[] & Opt = [];

  @Property({ type: "array" })
  disqualifyingFactKeys: string[] & Opt = [];

  @Property({ type: "array" })
  personalizationSlots: string[] & Opt = [];

  @Property({ type: "string" })
  impactModelKey!: string;

  @Property({ type: "boolean" })
  recurrenceAllowed: boolean & Opt = false;

  @Property({ type: "string" })
  fallbackTitlePt!: string;

  @Property({ type: "string" })
  fallbackDescriptionPt!: string;

  @Property({ type: "string" })
  fallbackReasonPt!: string;

  @Property({ type: "string", nullable: true })
  actionFingerprint?: string | null;

  @Property({ type: "json" })
  metadata: Record<string, unknown> = {};

  @Property({ type: "boolean" })
  active: boolean = true;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  updatedAt?: Date | null;

  /**
   * Information Expert: o pattern conhece os próprios `disqualifyingFactKeys`,
   * então é ele quem decide se está desqualificado para um conjunto de fatos.
   */
  isDisqualifiedBy(factKeys: ReadonlySet<string>): boolean {
    return this.disqualifyingFactKeys.some((key) => factKeys.has(key));
  }

  /**
   * Information Expert: pontuação de afinidade calculada a partir dos dados que
   * o próprio pattern possui (categoria + tipos de fato úteis).
   */
  affinityScore(affinities: Record<string, number>, factTypes: ReadonlySet<string>): number {
    let score = Number(affinities[this.category] ?? 0);
    if (this.requiredOrHelpfulFactTypes.some((type) => factTypes.has(type))) {
      score += 0.5;
    }
    return score;
  }
}
