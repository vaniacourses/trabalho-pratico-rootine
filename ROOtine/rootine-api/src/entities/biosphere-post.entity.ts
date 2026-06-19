import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "biosphere_posts" })
export class BiospherePost {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid" })
  userId!: string;

  @Property({ type: "string" })
  authorName: string = "Guardião Rootine";

  @Property({ type: "string" })
  postType: string = "community";

  @Property({ type: "string" })
  title!: string;

  @Property({ type: "string" })
  body!: string;

  @Property({ type: "string", nullable: true })
  category?: string | null;

  @Property({ type: "json" })
  impactSnapshot: Record<string, unknown> = {};

  @Property({ type: "string", nullable: true })
  achievementKey?: string | null;

  @Property({ type: "string" })
  visibility: string = "public";

  @Property({ type: "datetime", nullable: true })
  createdAt?: Date | null;

  @Property({ type: "datetime", nullable: true })
  updatedAt?: Date | null;
}
