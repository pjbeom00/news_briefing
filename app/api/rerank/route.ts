// app/api/rerank/route.ts - Gemini JSON 재선별 최종본

import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";

const parser = new Parser();

function buildRssUrl(query: string, lang: "ko" | "en") {
  const encoded = encodeURIComponent(query);

  if (lang === "ko") {
    return `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`;
  }

  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w가-힣]/g, "")
    .trim();
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || !query.trim()) {
      return Response.json(
        { error: "검색어가 비어 있습니다." },
        { status: 400 }
      );
    }

    const userQuery = query.trim();

    const [koFeed, enFeed] = await Promise.all([
      parser.parseURL(buildRssUrl(userQuery, "ko")),
      parser.parseURL(buildRssUrl(userQuery, "en")),
    ]);

    const rawItems = [...(koFeed.items || []), ...(enFeed.items || [])];

    const seen = new Set<string>();
    const uniqueItems: {
      title: string;
      link: string;
      snippet: string;
      pubDate: string;
    }[] = [];

    for (const item of rawItems) {
      const title = item.title || "";
      const link = item.link || "";
      const snippet = item.contentSnippet || item.content || "";
      const pubDate = item.pubDate || "";

      const normalizedTitle = normalizeText(title);
      const normalizedLink = String(link).trim();
      const dedupeKey = `${normalizedTitle}::${normalizedLink}`;

      if (!normalizedTitle && !normalizedLink) continue;
      if (seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);

      const cleanedSnippet =
        normalizeText(snippet) === normalizedTitle ? "" : snippet;

      uniqueItems.push({
        title,
        link,
        snippet: cleanedSnippet,
        pubDate,
      });
    }

    const sorted = uniqueItems.sort((a, b) => {
      return (
        new Date(b.pubDate || "").getTime() -
        new Date(a.pubDate || "").getTime()
      );
    });

    const items = sorted.slice(0, 30);

    await Promise.allSettled(
      items.map((item) =>
        prisma.news.upsert({
          where: { link: item.link },
          update: {
            title: item.title,
            snippet: item.snippet || null,
            pubDate: item.pubDate || null,
            sourceQuery: userQuery,
          },
          create: {
            title: item.title,
            link: item.link,
            snippet: item.snippet || null,
            pubDate: item.pubDate || null,
            sourceQuery: userQuery,
          },
        })
      )
    );

    return Response.json({ items });
  } catch (error: any) {
    console.error("RSS SEARCH ERROR:", error);

    return Response.json(
      { error: error?.message || "RSS 검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
