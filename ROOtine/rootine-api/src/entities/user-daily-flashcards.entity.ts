import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "user_daily_flashcards" })
export class UserDailyFlashcards {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "boolean", nullable: true })
  active?: boolean | null;

  @Property({ type: "integer", nullable: true })
  amount?: number | null;

  @Property({ type: "datetime", nullable: true })
  completedAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
