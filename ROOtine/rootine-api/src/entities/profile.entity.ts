import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "profiles" })
export class Profile {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "string", nullable: true })
  name?: string | null;

  @Property({ type: "string", nullable: true })
  nome?: string | null;

  @Property({ type: "integer" })
  xp: number = 1;

  @Property({ type: "json", nullable: true })
  socioeconomicContext?: Record<string, unknown> | null;

  @Property({ type: "json", nullable: true })
  learnedPreferences?: Record<string, unknown> | null;

  @Property({ type: "json", nullable: true })
  affinities?: Record<string, unknown> | null;

  @Property({ type: "json" })
  impactTotals: Record<string, unknown> = { co2_kg: 0, water_l: 0, waste_g: 0 };

  @Property({ type: "string", nullable: true })
  avatarUrl?: string | null;

  @Property({ type: "boolean", nullable: true })
  onboardingCompleted?: boolean | null;

  @Property({ type: "boolean", nullable: true })
  dailyFlashcardsCompleted?: boolean | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
