import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "sustainability_categories" })
export class SustainabilityCategoryEntity {
  @PrimaryKey({ type: "string" })
  key!: string;

  @Property({ type: "string" })
  labelPt!: string;

  @Property({ type: "string", nullable: true })
  description?: string | null;

  @Property({ type: "boolean" })
  active: boolean = true;

  @Property({ type: "integer" })
  sortOrder: number = 0;

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;
}
