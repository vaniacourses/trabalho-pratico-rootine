import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `ConteudoEducativo` (diagrama) materializado como flashcard. O catálogo de
 * flashcards é determinístico (nunca gerado por IA — ver regra de produto).
 */
@Entity({ tableName: "flashcards" })
export class Flashcard {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "string", nullable: true })
  question?: string | null;

  @Property({ type: "string", nullable: true })
  category?: string | null;

  @Property({ type: "string", nullable: true })
  signalKey?: string | null;

  @Property({ type: "string", nullable: true })
  signalType?: string | null;

  @Property({ type: "json" })
  trueEffect: Record<string, unknown> = {};

  @Property({ type: "json" })
  falseEffect: Record<string, unknown> = {};

  @Property({ type: "json" })
  skipEffect: Record<string, unknown> = {};

  @Property({ type: "float" })
  weight: number = 1;

  @Property({ type: "integer" })
  difficulty: number = 1;

  @Property({ type: "boolean" })
  active: boolean = true;
}
