import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/** Catálogo determinístico de quizzes (`ConteudoEducativo`). */
@Entity({ tableName: "quiz_questions" })
export class QuizQuestion {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "string" })
  category!: string;

  @Property({ type: "string" })
  question!: string;

  @Property({ type: "json" })
  options!: Record<string, unknown>;

  @Property({ type: "string" })
  correctOption!: string;

  @Property({ type: "string", nullable: true })
  explanation?: string | null;

  @Property({ type: "integer" })
  difficulty: number = 1;

  @Property({ type: "string", nullable: true })
  signalKey?: string | null;

  @Property({ type: "boolean" })
  active: boolean = true;

  @Property({ type: "json" })
  metadata: Record<string, unknown> = {};

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  updatedAt?: Date | null;
}
