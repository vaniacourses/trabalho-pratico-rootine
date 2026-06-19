import { Injectable, Logger } from "@nestjs/common";

export interface FeedItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface BiosphereFeed {
  success: true;
  region: string;
  news: FeedItem[];
  events: FeedItem[];
  fetchedAt: string;
}

/**
 * Busca notícias e eventos ambientais reais de Niterói / Rio de Janeiro via
 * Google Notícias RSS. Porte da antiga Edge Function `biosphere-feed`, agora
 * servida pelo backend NestJS. Resultado é cacheado em memória por 15 min para
 * não sobrecarregar o Google a cada abertura do app.
 */
@Injectable()
export class NewsService {
  private readonly logger = new Logger("NEWS");
  private readonly cacheTtlMs = 15 * 60 * 1000;
  private cache: { data: BiosphereFeed; expiresAt: number } | null = null;

  private readonly feeds = {
    news: [
      "https://news.google.com/rss/search?q=Niter%C3%B3i+meio+ambiente+OR+sustentabilidade+OR+clima&hl=pt-BR&gl=BR&ceid=BR:pt-419",
      "https://news.google.com/rss/search?q=%22Rio+de+Janeiro%22+meio+ambiente+OR+reciclagem+OR+energia&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    ],
    events: [
      "https://news.google.com/rss/search?q=eventos+Niter%C3%B3i+ambiente+OR+sustentabilidade+OR+ecologia+OR+mutir%C3%A3o&hl=pt-BR&gl=BR&ceid=BR:pt-419",
      "https://news.google.com/rss/search?q=eventos+%22Rio+de+Janeiro%22+meio+ambiente+OR+voluntariado+OR+feira&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    ],
  };

  async getBiosphereFeed(): Promise<BiosphereFeed> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    const [news, events] = await Promise.all([
      this.fetchFeedItems(this.feeds.news, 5),
      this.fetchFeedItems(this.feeds.events, 5),
    ]);

    const data: BiosphereFeed = {
      success: true,
      region: "Niterói / Rio de Janeiro",
      news,
      events,
      fetchedAt: new Date().toISOString(),
    };

    this.cache = { data, expiresAt: Date.now() + this.cacheTtlMs };
    this.logger.log(`Feed atualizado: ${news.length} notícias, ${events.length} eventos`);
    return data;
  }

  async getEnvironmentalNews(filter?: { limit?: number }): Promise<FeedItem[]> {
    const feed = await this.getBiosphereFeed();
    return feed.news.slice(0, filter?.limit ?? 10);
  }

  async getNiteroiNews(limit = 10): Promise<FeedItem[]> {
    return this.getEnvironmentalNews({ limit });
  }

  async getEnvironmentalEvents(limit = 5): Promise<FeedItem[]> {
    const feed = await this.getBiosphereFeed();
    return feed.events.slice(0, limit);
  }

  private async fetchFeedItems(urls: string[], limit: number): Promise<FeedItem[]> {
    const collected: FeedItem[] = [];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "RootineApp/1.0 (Biosphere Feed)",
            Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          },
        });

        if (!response.ok) {
          this.logger.warn(`Feed HTTP ${response.status}: ${url}`);
          continue;
        }

        const xml = await response.text();
        collected.push(...this.parseRssItems(xml));
      } catch (error) {
        this.logger.warn(`Falha ao buscar feed ${url}: ${(error as Error)?.message}`);
      }
    }

    return this.dedupe(collected)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit);
  }

  private parseRssItems(xml: string): FeedItem[] {
    const items: FeedItem[] = [];
    const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

    for (const block of blocks) {
      const title = this.decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const link = this.decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
      const pubDate = this.decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
      const description = this.decodeXml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "");
      const source = this.decodeXml(
        block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "Google Notícias",
      );

      if (!title || !link) continue;

      items.push({
        title,
        summary: description || "Sem descrição disponível.",
        source,
        url: link,
        publishedAt: pubDate || new Date().toISOString(),
      });
    }

    return items;
  }

  private dedupe(items: FeedItem[]): FeedItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private decodeXml(value: string): string {
    return value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
