import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";

@Entity({ tableName: "user_achievements" })
@Unique({ properties: ["userId", "achievementKey"] })
export class UserAchievement {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  achievementKey!: string;

  @Property({ type: "uuid", nullable: true })
  xpLedgerId?: string | null;

  @Property({ type: "json" })
  metadata: Record<string, unknown> = {};

  @Property({ type: "datetime", nullable: true })
  unlockedAt?: Date | null;
}
