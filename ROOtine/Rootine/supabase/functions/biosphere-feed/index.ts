import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

interface FeedItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

const FEEDS = {
  news: [
    "https://news.google.com/rss/search?q=Niter%C3%B3i+meio+ambiente+OR+sustentabilidade+OR+clima&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/search?q=%22Rio+de+Janeiro%22+meio+ambiente+OR+reciclagem+OR+energia&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  ],
  events: [
    "https://news.google.com/rss/search?q=eventos+Niter%C3%B3i+ambiente+OR+sustentabilidade+OR+ecologia+OR+mutir%C3%A3o&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/search?q=eventos+%22Rio+de+Janeiro%22+meio+ambiente+OR+voluntariado+OR+feira&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  ],
};

function decodeXml(value: string) {
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

function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of blocks) {
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const pubDate = decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    const description = decodeXml(
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "",
    );
    const source = decodeXml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "Google Notícias");

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

function dedupeItems(items: FeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchFeedItems(urls: string[], limit: number) {
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
        console.warn("[BIOSPHERE] Feed HTTP error:", url, response.status);
        continue;
      }

      const xml = await response.text();
      collected.push(...parseRssItems(xml));
    } catch (error) {
      console.warn("[BIOSPHERE] Feed fetch failed:", url, error);
    }
  }

  return dedupeItems(collected)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const [news, events] = await Promise.all([
      fetchFeedItems(FEEDS.news, 5),
      fetchFeedItems(FEEDS.events, 5),
    ]);

    return jsonResponse({
      success: true,
      region: "Niterói / Rio de Janeiro",
      news,
      events,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[BIOSPHERE] Feed error:", error.message);
    return jsonResponse({ error: error.message }, 400);
  }
});
