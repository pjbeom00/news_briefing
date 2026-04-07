// app/api/search/route.ts - 한글/영문 RSS 검색 + 중복 제거 + DB 저장까지 포함
// (2026-03-30) : 제목 유사 중복 제거 강화
// (2026-04-07) 업그레이드 포인트:
// 1) 제목 + snippet 기반 중복 제거 강화
// 2) 토큰 Jaccard + 3-gram 유사도 조합
// 3) 점수는 유지하되 스토리 단위 중복 억제 강화
// 4) 기존 SearchItem 응답 형태 유지

import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parser = new Parser();

type RankedItem = {
  title: string;
  link: string;
  snippet: string;
  pubDate: string;
  sourceDomain: string;
  keywordScore: number;
  tfidfScore: number;
  freshnessScore: number;
  importanceScore: number;
  diversityPenalty: number;
  finalScore: number;
};

type RawNewsItem = {
  title: string;
  link: string;
  snippet: string;
  pubDate: string;
  sourceDomain: string;
};

function buildRssUrl(query: string, lang: "ko" | "en") {
  const encoded = encodeURIComponent(query);

  if (lang === "ko") {
    return `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`;
  }

  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
}

function normalizeWhitespace(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripNoisePrefix(title: string) {
  let t = normalizeWhitespace(title);
  t = t.replace(/^\[(속보|단독|인터뷰|기획|사설|오피니언|분석|르포|종합)\]\s*/gi, "");
  t = t.replace(/^(속보|단독|인터뷰|기획|사설|오피니언|분석|르포|종합)\s*[:：-]\s*/gi, "");
  return normalizeWhitespace(t);
}

function stripTrailingPublisher(title: string) {
  let t = normalizeWhitespace(title);
  t = t.replace(/\s*[-|｜:·]\s*[^-|｜:·]{2,30}$/, "");
  t = t.replace(/\s*\([^)]{2,30}\)\s*$/, "");
  return normalizeWhitespace(t);
}

function normalizeTitleBase(title: string) {
  let t = normalizeWhitespace(title);
  t = stripNoisePrefix(t);
  t = stripTrailingPublisher(t);

  t = t
    .replace(/[“”"']/g, "")
    .replace(/[|｜]/g, " ")
    .replace(/[【】\[\]{}()<>]/g, " ")
    .replace(/[·•]/g, " ")
    .replace(/[.,!?~]/g, " ")
    .replace(/[^\w가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return t;
}

function normalizeText(value: string) {
  return normalizeTitleBase(value);
}

function normalizeCompact(value: string) {
  return normalizeTitleBase(value).replace(/\s+/g, "");
}

function getTokens(value: string) {
  return normalizeTitleBase(value)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length >= 2);
}

function getCharNgrams(value: string, n = 3) {
  const compact = normalizeCompact(value);
  if (!compact) return [];
  if (compact.length <= n) return [compact];

  const result: string[] = [];
  for (let i = 0; i <= compact.length - n; i += 1) {
    result.push(compact.slice(i, i + n));
  }
  return result;
}

function jaccardSimilarity(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) intersection += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function containsCompact(a: string, b: string) {
  const aa = normalizeCompact(a);
  const bb = normalizeCompact(b);
  if (!aa || !bb) return false;
  return aa.includes(bb) || bb.includes(aa);
}

function titleSimilarity(a: string, b: string) {
  const tokenSim = jaccardSimilarity(getTokens(a), getTokens(b));
  const gramSim = jaccardSimilarity(getCharNgrams(a), getCharNgrams(b));
  const compactMatch = containsCompact(a, b) ? 1 : 0;

  return Math.max(tokenSim, gramSim * 0.9, compactMatch);
}

function contentSimilarity(a: string, b: string) {
  const tokenSim = jaccardSimilarity(getTokens(a), getTokens(b));
  const gramSim = jaccardSimilarity(getCharNgrams(a), getCharNgrams(b));
  return Math.max(tokenSim, gramSim * 0.92);
}

function snippetFingerprint(snippet: string) {
  return normalizeText(snippet)
    .replace(/\b(기자|입력|수정|무단전재|재배포|금지)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNearDuplicate(a: RawNewsItem, b: RawNewsItem) {
  const titleSim = titleSimilarity(a.title, b.title);

  if (normalizeCompact(a.link) === normalizeCompact(b.link)) return true;
  if (titleSim >= 0.9) return true;

  const aSnippet = snippetFingerprint(a.snippet);
  const bSnippet = snippetFingerprint(b.snippet);

  const snippetSim = contentSimilarity(aSnippet, bSnippet);

  if (titleSim >= 0.78 && snippetSim >= 0.62) return true;
  if (titleSim >= 0.72 && containsCompact(aSnippet, bSnippet)) return true;
  if (containsCompact(a.title, b.title) && snippetSim >= 0.58) return true;

  return false;
}

function getStopWords() {
  return new Set([
    "and",
    "or",
    "the",
    "a",
    "an",
    "of",
    "for",
    "to",
    "in",
    "on",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "as",
    "at",
    "from",
    "news",
    "briefing",
    "브리핑",
    "뉴스",
    "관련",
    "대한",
    "에서",
    "으로",
    "그리고",
    "또는",
    "및",
  ]);
}

function extractQueryTerms(query: string) {
  return String(query || "")
    .replace(/[|,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);
}

function buildDynamicKeywords(query: string) {
  const stopWords = getStopWords();

  const baseTerms = extractQueryTerms(query)
    .map((term) => term.trim())
    .filter((term) => {
      const lower = term.toLowerCase();
      if (!term) return false;
      if (stopWords.has(lower)) return false;
      if (term.length <= 1) return false;
      return true;
    });

  const strongKeywords = Array.from(
    new Set(baseTerms.map((term) => normalizeText(term)))
  );

  const relatedAliases: Record<string, string[]> = {
    samsung: ["samsung", "삼성", "삼성전자"],
    hynix: ["hynix", "sk hynix", "sk하이닉스", "하이닉스"],
    micron: ["micron", "마이크론"],
    nvidia: ["nvidia", "엔비디아"],
    openai: ["openai", "chatgpt"],
    gemini: ["gemini", "google ai", "구글 ai"],
    claude: ["claude", "anthropic"],
    ai: ["ai", "인공지능"],
    api: ["api"],
    gpu: ["gpu"],
    cpu: ["cpu"],
    hbm: ["hbm", "고대역폭메모리", "high bandwidth memory"],
    dram: ["dram", "d램", "디램"],
    nand: ["nand", "낸드"],
    logistics: ["logistics", "물류", "supply chain", "공급망"],
    cloud: ["cloud", "클라우드"],
  };

  const expanded = new Set<string>();

  for (const term of strongKeywords) {
    expanded.add(term);

    for (const aliases of Object.values(relatedAliases)) {
      if (
        aliases.some(
          (alias) =>
            alias.toLowerCase().includes(term) || term.includes(alias.toLowerCase())
        )
      ) {
        aliases.forEach((alias) => expanded.add(alias.toLowerCase()));
      }
    }
  }

  return {
    strongKeywords,
    relatedKeywords: Array.from(expanded),
  };
}

function keywordScore(query: string, item: RawNewsItem) {
  const text = normalizeText(`${item.title} ${item.snippet}`);
  const title = normalizeText(item.title);
  const { strongKeywords, relatedKeywords } = buildDynamicKeywords(query);

  let score = 0;

  for (const keyword of strongKeywords) {
    if (text.includes(keyword)) score += 6;
    if (title.includes(keyword)) score += 4;
  }

  for (const keyword of relatedKeywords) {
    if (text.includes(keyword)) score += 2;
  }

  return score;
}

function computeTfIdfScores(items: RawNewsItem[], query: string) {
  const queryTerms = Array.from(
    new Set(
      extractQueryTerms(query)
        .map((term) => normalizeText(term))
        .filter(Boolean)
    )
  );

  const docCount = Math.max(items.length, 1);

  const dfMap = new Map<string, number>();

  for (const term of queryTerms) {
    let docFreq = 0;
    for (const item of items) {
      const tokens = getTokens(`${item.title} ${item.snippet}`);
      if (tokens.some((token) => token.includes(term) || term.includes(token))) {
        docFreq += 1;
      }
    }
    dfMap.set(term, docFreq);
  }

  return items.map((item) => {
    const tokens = getTokens(`${item.title} ${item.snippet}`);
    const tokenText = tokens.join(" ");

    let score = 0;

    for (const term of queryTerms) {
      const tf = tokens.filter(
        (token) => token.includes(term) || term.includes(token)
      ).length;

      if (tf === 0) continue;

      const df = dfMap.get(term) || 1;
      const idf = Math.log((docCount + 1) / df) + 1;
      score += tf * idf;

      if (normalizeText(item.title).includes(term)) {
        score += 0.8;
      }

      if (tokenText.includes(term)) {
        score += 0.4;
      }
    }

    return Math.round(score * 10) / 10;
  });
}

function freshnessScore(pubDate: string) {
  const pubTime = new Date(pubDate || "").getTime();
  if (!Number.isFinite(pubTime)) return 0;

  const ageHours = Math.max(0, (Date.now() - pubTime) / (1000 * 60 * 60));

  if (ageHours <= 12) return 5;
  if (ageHours <= 24) return 4.5;
  if (ageHours <= 48) return 4;
  if (ageHours <= 72) return 3.4;
  if (ageHours <= 7 * 24) return 2.6;
  if (ageHours <= 14 * 24) return 1.6;
  return 0.8;
}

function importanceScore(item: RawNewsItem) {
  const text = `${item.title} ${item.snippet}`;
  let score = 0;

  if (/투자|수주|실적|매출|제휴|협력|계약|공급|확대|출시|양산|증설|인수|합병/i.test(text)) {
    score += 4;
  }

  if (/\d+%|\d+억|\d+조|\d+만|\d+배/.test(text)) {
    score += 3;
  }

  if (/전망|전략|정책|규제|리스크|영향|공급망|원가|수익성/i.test(text)) {
    score += 2;
  }

  return Math.min(score, 6);
}

function extractSourceDomain(link: string) {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function uniqueByNearDuplicate(scoredItems: RankedItem[]) {
  const result: RankedItem[] = [];

  for (const item of scoredItems) {
    const duplicated = result.some((existing) =>
      isNearDuplicate(
        {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          pubDate: item.pubDate,
          sourceDomain: item.sourceDomain,
        },
        {
          title: existing.title,
          link: existing.link,
          snippet: existing.snippet,
          pubDate: existing.pubDate,
          sourceDomain: existing.sourceDomain,
        }
      )
    );

    if (!duplicated) {
      result.push(item);
    }
  }

  return result;
}

async function fetchRssItems(query: string) {
  const urls = [buildRssUrl(query, "ko"), buildRssUrl(query, "en")];

  const feeds = await Promise.all(
    urls.map(async (url) => {
      try {
        return await parser.parseURL(url);
      } catch (error) {
        console.error("RSS FETCH ERROR:", url, error);
        return { items: [] as any[] };
      }
    })
  );

  const raw: RawNewsItem[] = [];

  for (const feed of feeds) {
    for (const item of feed.items || []) {
      const title = normalizeWhitespace((item as any).title || "");
      const link = normalizeWhitespace((item as any).link || "");
      const snippet = normalizeWhitespace(
        (item as any).contentSnippet ||
          (item as any).content ||
          (item as any).summary ||
          ""
      );
      const pubDate = normalizeWhitespace(
        (item as any).pubDate || (item as any).isoDate || ""
      );

      if (!title || !link) continue;

      raw.push({
        title,
        link,
        snippet,
        pubDate,
        sourceDomain: extractSourceDomain(link),
      });
    }
  }

  const dedupedByLink = Array.from(
    new Map(raw.map((item) => [item.link, item])).values()
  );

  return dedupedByLink;
}

async function saveNewsItems(items: RankedItem[], query: string) {
  await Promise.all(
    items.map((item) =>
      prisma.news.upsert({
        where: {
          link: item.link,
        },
        create: {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          pubDate: item.pubDate,
          sourceQuery: query,
        },
        update: {
          title: item.title,
          snippet: item.snippet,
          pubDate: item.pubDate,
          sourceQuery: query,
        },
      })
    )
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();

    if (!query) {
      return Response.json(
        {
          error: "query 값이 비어 있습니다.",
          items: [],
        },
        { status: 400 }
      );
    }

    const rawItems = await fetchRssItems(query);

    if (!rawItems.length) {
      return Response.json({
        items: [],
      });
    }

    const tfidfScores = computeTfIdfScores(rawItems, query);

    const preliminary: RankedItem[] = rawItems.map((item, index) => {
      const ks = keywordScore(query, item);
      const tfidf = tfidfScores[index] || 0;
      const fs = freshnessScore(item.pubDate);
      const iscore = importanceScore(item);

      return {
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        pubDate: item.pubDate,
        sourceDomain: item.sourceDomain,
        keywordScore: ks,
        tfidfScore: tfidf,
        freshnessScore: fs,
        importanceScore: iscore,
        diversityPenalty: 0,
        finalScore: 0,
      };
    });

    const domainCounts = new Map<string, number>();
    for (const item of preliminary) {
      if (!item.sourceDomain) continue;
      domainCounts.set(item.sourceDomain, (domainCounts.get(item.sourceDomain) || 0) + 1);
    }

    const scored = preliminary.map((item) => {
      const sameDomainCount = domainCounts.get(item.sourceDomain) || 1;
      const diversityPenalty = sameDomainCount >= 4 ? 1.2 : sameDomainCount >= 3 ? 0.8 : 0;

      const finalScore =
        item.keywordScore * 1.4 +
        item.tfidfScore * 1.15 +
        item.freshnessScore * 1.0 +
        item.importanceScore * 1.2 -
        diversityPenalty;

      return {
        ...item,
        diversityPenalty,
        finalScore: Math.round(finalScore * 100) / 100,
      };
    });

    const sorted = [...scored].sort((a, b) => b.finalScore - a.finalScore);
    const deduped = uniqueByNearDuplicate(sorted).slice(0, 30);

    await saveNewsItems(deduped, query);

    return Response.json({
      items: deduped,
    });
  } catch (error: any) {
    console.error("SEARCH API ERROR:", error);

    return Response.json(
      {
        error: error?.message || "뉴스 검색 중 오류가 발생했습니다.",
        items: [],
      },
      { status: 500 }
    );
  }
}
