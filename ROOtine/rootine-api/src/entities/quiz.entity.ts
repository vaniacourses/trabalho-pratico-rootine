import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/** Quizzes gerados (tabela legada `quizzes`). */
@Entity({ tableName: "quizzes" })
export class Quiz {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  question!: string;

  @Property({ type: "json" })
  options!: Record<string, unknown>;

  @Property({ type: "string" })
  correctOption!: string;

  @Property({ type: "string", nullable: true })
  explanation?: string | null;

  @Property({ type: "string", nullable: true })
  category?: string | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
