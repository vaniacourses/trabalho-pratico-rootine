import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "user_quiz_answers" })
export class UserQuizAnswer {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "uuid", nullable: true })
  quizId?: string | null;

  @Property({ type: "uuid", nullable: true })
  quizQuestionId?: string | null;

  @Property({ type: "string" })
  selectedOption!: string;

  @Property({ type: "boolean" })
  correct!: boolean;

  @Property({ type: "datetime", nullable: true })
  answeredAt?: Date | null;
}
