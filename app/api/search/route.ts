// app/api/search/route.ts - 한글/영문 RSS 검색 + 중복 제거 + DB 저장까지 포함
// 2026-03-30 : 제목 유사 중복 제거 강화

import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";

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

function normalizeCompact(value: string) {
  return normalizeTitleBase(value).replace(/\s+/g, "");
}

function getTokens(title: string) {
  return normalizeTitleBase(title)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length >= 2);
}

function jaccardSimilarity(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);

  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;

  if (union === 0) return 0;
  return intersection / union;
}

function getBigrams(text: string) {
  const s = normalizeCompact(text);
  if (s.length < 2) return [s];

  const result: string[] = [];
  for (let i = 0; i < s.length - 1; i += 1) {
    result.push(s.slice(i, i + 2));
  }
  return result;
}

function diceCoefficient(a: string, b: string) {
  const aBigrams = getBigrams(a);
  const bBigrams = getBigrams(b);

  if (!aBigrams.length || !bBigrams.length) return 0;

  const aMap = new Map<string, number>();
  for (const g of aBigrams) {
    aMap.set(g, (aMap.get(g) || 0) + 1);
  }

  let intersection = 0;
  for (const g of bBigrams) {
    const count = aMap.get(g) || 0;
    if (count > 0) {
      intersection += 1;
      aMap.set(g, count - 1);
    }
  }

  return (2 * intersection) / (aBigrams.length + bBigrams.length);
}

function isPrefixSimilar(a: string, b: string) {
  const x = normalizeTitleBase(a);
  const y = normalizeTitleBase(b);

  if (!x || !y) return false;
  if (x === y) return true;

  const minLen = Math.min(x.length, y.length);
  if (minLen < 12) return false;

  const short = x.length <= y.length ? x : y;
  const long = x.length > y.length ? x : y;

  if (long.startsWith(short)) return true;
  if (long.includes(short) && short.length / long.length >= 0.75) return true;

  return false;
}

function areSimilarTitles(titleA: string, titleB: string) {
  const baseA = normalizeTitleBase(titleA);
  const baseB = normalizeTitleBase(titleB);

  if (!baseA || !baseB) return false;

  if (baseA === baseB) return true;
  if (normalizeCompact(baseA) === normalizeCompact(baseB)) return true;
  if (isPrefixSimilar(baseA, baseB)) return true;

  const tokensA = getTokens(titleA);
  const tokensB = getTokens(titleB);
  const tokenSimilarity = jaccardSimilarity(tokensA, tokensB);

  const dice = diceCoefficient(baseA, baseB);

  if (tokenSimilarity >= 0.8) return true;
  if (dice >= 0.88) return true;
  if (tokenSimilarity >= 0.65 && dice >= 0.78) return true;

  return false;
}

function chooseBetterItem(
  current: {
    title: string;
    link: string;
    snippet: string;
    pubDate: string;
  },
  incoming: {
    title: string;
    link: string;
    snippet: string;
    pubDate: string;
  }
) {
  const currentTime = new Date(current.pubDate || "").getTime() || 0;
  const incomingTime = new Date(incoming.pubDate || "").getTime() || 0;

  const currentHasSnippet = current.snippet ? 1 : 0;
  const incomingHasSnippet = incoming.snippet ? 1 : 0;

  const currentTitleLen = normalizeWhitespace(current.title).length;
  const incomingTitleLen = normalizeWhitespace(incoming.title).length;

  const currentScore =
    currentHasSnippet * 30 + currentTitleLen + currentTime / 1_000_000_000;
  const incomingScore =
    incomingHasSnippet * 30 + incomingTitleLen + incomingTime / 1_000_000_000;

  return incomingScore > currentScore ? incoming : current;
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
  const stopWords = getStopWords();

  return String(query || "")
    .replace(/[|,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
    .filter((term) => term.length > 1)
    .filter((term) => !stopWords.has(term));
}

function countOccurrences(text: string, term: string) {
  const source = normalizeTitleBase(text);
  if (!source || !term) return 0;

  let count = 0;
  let index = 0;

  while (true) {
    const found = source.indexOf(term, index);
    if (found === -1) break;
    count += 1;
    index = found + term.length;
  }

  return count;
}

function computeKeywordScore(title: string, snippet: string, queryTerms: string[]) {
  const titleBase = normalizeTitleBase(title);
  const snippetBase = normalizeTitleBase(snippet);
  let score = 0;

  for (const term of queryTerms) {
    if (titleBase.includes(term)) score += 6;
    if (snippetBase.includes(term)) score += 2;
  }

  return score;
}

function computeTfidfScore(
  docText: string,
  title: string,
  queryTerms: string[],
  documents: string[]
) {
  if (!queryTerms.length || !documents.length) return 0;

  const N = documents.length;
  let total = 0;

  for (const term of queryTerms) {
    const df = documents.filter((doc) => doc.includes(term)).length;
    const idf = Math.log((N + 1) / (df + 1)) + 1;

    const tfTitle = countOccurrences(title, term);
    const tfBody = countOccurrences(docText, term);

    total += (tfTitle * 2.2 + tfBody * 1.0) * idf;
  }

  return Number(total.toFixed(2));
}

function computeFreshnessScore(pubDate: string) {
  const time = new Date(pubDate || "").getTime();
  if (!time || Number.isNaN(time)) return 0;

  const ageHours = Math.max(0, (Date.now() - time) / (1000 * 60 * 60));

  if (ageHours <= 6) return 6;
  if (ageHours <= 24) return 5;
  if (ageHours <= 72) return 4;
  if (ageHours <= 168) return 3;
  if (ageHours <= 336) return 2;
  return 1;
}

function computeImportanceScore(title: string, snippet: string) {
  const text = `${title} ${snippet}`.toLowerCase();

  let score = 0;

  const importancePatterns = [
    /실적|매출|영업이익|가이던스|전망|투자|수주|계약|출시|양산|공급|발표|인수|합병|규제|정책|협력|파트너십/,
    /earnings|guidance|outlook|investment|launch|production|supply|deal|acquisition|merger|policy|partnership|contract/,
  ];

  for (const pattern of importancePatterns) {
    if (pattern.test(text)) score += 3;
  }

  if (/\d/.test(text)) score += 1;
  if (/%|조원|억원|million|billion/.test(text)) score += 1;

  return score;
}

function extractSourceDomain(link: string) {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
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
    const queryTerms = extractQueryTerms(userQuery);

    const [koFeed, enFeed] = await Promise.all([
      parser.parseURL(buildRssUrl(userQuery, "ko")),
      parser.parseURL(buildRssUrl(userQuery, "en")),
    ]);

    const rawItems = [...(koFeed.items || []), ...(enFeed.items || [])];

    const exactSeen = new Set<string>();
    const exactDeduped: {
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

      if (!title && !link) continue;

      const exactKey = `${normalizeCompact(title)}::${String(link).trim()}`;
      if (exactSeen.has(exactKey)) continue;
      exactSeen.add(exactKey);

      const cleanedSnippet =
        normalizeCompact(snippet) === normalizeCompact(title) ? "" : snippet;

      exactDeduped.push({
        title,
        link,
        snippet: cleanedSnippet,
        pubDate,
      });
    }

    const clustered: {
      title: string;
      link: string;
      snippet: string;
      pubDate: string;
    }[] = [];

    for (const item of exactDeduped) {
      let matchedIndex = -1;

      for (let i = 0; i < clustered.length; i += 1) {
        if (areSimilarTitles(clustered[i].title, item.title)) {
          matchedIndex = i;
          break;
        }
      }

      if (matchedIndex === -1) {
        clustered.push(item);
      } else {
        clustered[matchedIndex] = chooseBetterItem(clustered[matchedIndex], item);
      }
    }

    const documents = clustered.map((item) =>
      normalizeTitleBase(`${item.title} ${item.snippet}`)
    );

    const rankedBase: RankedItem[] = clustered.map((item) => {
      const docText = normalizeTitleBase(`${item.title} ${item.snippet}`);
      const sourceDomain = extractSourceDomain(item.link);

      const keywordScore = computeKeywordScore(item.title, item.snippet, queryTerms);
      const tfidfScore = computeTfidfScore(docText, item.title, queryTerms, documents);
      const freshnessScore = computeFreshnessScore(item.pubDate);
      const importanceScore = computeImportanceScore(item.title, item.snippet);

      const finalScore =
        keywordScore * 1.8 +
        tfidfScore * 1.2 +
        freshnessScore * 1.1 +
        importanceScore * 1.4;

      return {
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        pubDate: item.pubDate,
        sourceDomain,
        keywordScore: Number(keywordScore.toFixed(2)),
        tfidfScore: Number(tfidfScore.toFixed(2)),
        freshnessScore: Number(freshnessScore.toFixed(2)),
        importanceScore: Number(importanceScore.toFixed(2)),
        diversityPenalty: 0,
        finalScore: Number(finalScore.toFixed(2)),
      };
    });

    rankedBase.sort((a, b) => {
      const timeA = new Date(a.pubDate || "").getTime() || 0;
      const timeB = new Date(b.pubDate || "").getTime() || 0;

      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return timeB - timeA;
    });

    const domainCount = new Map<string, number>();
    const diversified = rankedBase.map((item) => {
      const count = domainCount.get(item.sourceDomain) || 0;
      domainCount.set(item.sourceDomain, count + 1);

      const diversityPenalty = count * 1.25;
      const finalScore = Number((item.finalScore - diversityPenalty).toFixed(2));

      return {
        ...item,
        diversityPenalty,
        finalScore,
      };
    });

    diversified.sort((a, b) => {
      const timeA = new Date(a.pubDate || "").getTime() || 0;
      const timeB = new Date(b.pubDate || "").getTime() || 0;

      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return timeB - timeA;
    });

    const items = diversified.slice(0, 30);

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
