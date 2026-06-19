import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "achievement_definitions" })
export class AchievementDefinition {
  @PrimaryKey({ type: "string" })
  key!: string;

  @Property({ type: "string" })
  title!: string;

  @Property({ type: "string" })
  description!: string;

  @Property({ type: "integer" })
  xpReward: number = 0;

  @Property({ type: "string", nullable: true })
  category?: string | null;

  @Property({ type: "json" })
  criteria: Record<string, unknown> = {};

  @Property({ type: "boolean" })
  active: boolean = true;

  @Property({ type: "integer" })
  sortOrder: number = 0;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  updatedAt?: Date | null;
}
