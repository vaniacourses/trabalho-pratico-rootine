import { Controller, Get, Query } from "@nestjs/common";
import { NewsService } from "./news.service";

@Controller("news")
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get("environment")
  async getEnvironmentalNews(@Query("limit") limit?: string) {
    return this.news.getEnvironmentalNews({ limit: limit ? Number(limit) : 10 });
  }

  @Get("niteroi")
  async getNiteroiNews(@Query("limit") limit?: string) {
    return this.news.getNiteroiNews(limit ? Number(limit) : 10);
  }

  @Get("events")
  async getEnvironmentalEvents(@Query("limit") limit?: string) {
    return this.news.getEnvironmentalEvents(limit ? Number(limit) : 5);
  }
}
