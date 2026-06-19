import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { BiospherePost } from "../entities/biosphere-post.entity";

/**
 * Porte de `biosphere-feed`. Público (sem dados pessoais): lista posts
 * comunitários visíveis ordenados por data.
 */
@Injectable()
export class BiosphereService {
  constructor(private readonly em: EntityManager) {}

  async feed(limit = 30) {
    const posts = await this.em.find(
      BiospherePost,
      { visibility: "public" },
      { orderBy: { createdAt: "desc" }, limit },
    );
    return posts.map((post) => ({
      id: post.id,
      authorName: post.authorName,
      postType: post.postType,
      title: post.title,
      body: post.body,
      category: post.category,
      impactSnapshot: post.impactSnapshot,
      createdAt: post.createdAt,
    }));
  }
}
