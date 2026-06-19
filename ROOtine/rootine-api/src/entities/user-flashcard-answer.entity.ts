import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "user_flashcards_answers" })
export class UserFlashcardAnswer {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "uuid" })
  flashcardId!: string;

  @Property({ type: "uuid", fieldName: "daily_batch" })
  dailyBatch!: string;

  @Property({ type: "boolean", nullable: true })
  answer?: boolean | null;

  @Property({ type: "datetime", nullable: true })
  answeredAt?: Date | null;
}
