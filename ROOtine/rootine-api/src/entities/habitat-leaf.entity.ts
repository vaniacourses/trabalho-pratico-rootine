import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

/**
 * `Habitat` (diagrama). Nível/saúde são derivados da curva de XP — não há coluna
 * de nível aqui; esta tabela guarda apenas as folhas narrativas da árvore.
 */
@Entity({ tableName: "habitat_leaves" })
export class HabitatLeaf {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "integer" })
  position!: number;

  @Property({ type: "string" })
  title!: string;

  @Property({ type: "string" })
  message!: string;

  @Property({ type: "json", nullable: true })
  sourceEvent?: Record<string, unknown> | null;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
