// app/api/rerank/route.ts - Gemini JSON 재선별 최종본
// File: app/api/rerank/route.ts
// (2026-04-07) 업그레이드 포인트:
// 1) 최종 선정 전 한 번 더 중복 기사 억제
// 2) 제목 + snippet 기준 스토리 병합
// 3) 점수는 유지하되 유사 기사 몰림 방지
// 중복 억제 + Gemini 재선별 + 부족한 결과 자동 보충

import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchItem = {
  title: string;
  link: string;
  snippet: string;
  pubDate: string;
  sourceDomain?: string;
  keywordScore?: number;
  tfidfScore?: number;
  freshnessScore?: number;
  importanceScore?: number;
  diversityPenalty?: number;
  finalScore?: number;
};

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
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

function jaccardSimilarityArray(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);

  if (!setA.size || !setB.size) return 0;

  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) intersection += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function textSimilarity(a: string, b: string) {
  const tokenSim = jaccardSimilarityArray(tokenize(a), tokenize(b));
  const gramSim = jaccardSimilarityArray(getCharNgrams(a), getCharNgrams(b));
  const compactEqual =
    normalizeCompact(a) === normalizeCompact(b) ||
    normalizeCompact(a).includes(normalizeCompact(b)) ||
    normalizeCompact(b).includes(normalizeCompact(a));

  return Math.max(tokenSim, gramSim * 0.92, compactEqual ? 1 : 0);
}

function isDuplicateStory(a: SearchItem, b: SearchItem) {
  const titleSim = textSimilarity(a.title, b.title);
  const snippetSim = textSimilarity(a.snippet || "", b.snippet || "");

  if (normalizeCompact(a.link) === normalizeCompact(b.link)) return true;
  if (titleSim >= 0.9) return true;
  if (titleSim >= 0.78 && snippetSim >= 0.6) return true;
  return false;
}

function queryMatchScore(query: string, item: SearchItem) {
  const text = normalizeText(`${item.title} ${item.snippet}`);
  const title = normalizeText(item.title);
  const tokens = tokenize(query);

  let score = 0;
  for (const token of tokens) {
    if (token.length <= 1) continue;
    if (text.includes(token)) score += 3;
    if (title.includes(token)) score += 2;
  }

  return score;
}

function businessSignalScore(item: SearchItem) {
  const text = `${item.title} ${item.snippet}`;
  let score = 0;

  if (/투자|수주|실적|매출|제휴|협력|계약|공급|확대|출시|양산|증설|인수|합병/i.test(text)) {
    score += 4;
  }

  if (/\d+%|\d+억|\d+조|\d+만|\d+배/.test(text)) {
    score += 3;
  }

  if (/전망|전략|정책|규제|리스크|공급망|원가|수익성|운영/i.test(text)) {
    score += 2;
  }

  return score;
}

function freshnessScore(item: SearchItem) {
  const pubTime = new Date(item.pubDate || "").getTime();
  if (!Number.isFinite(pubTime)) return 0;

  const ageHours = Math.max(0, (Date.now() - pubTime) / (1000 * 60 * 60));

  if (ageHours <= 12) return 5;
  if (ageHours <= 24) return 4;
  if (ageHours <= 48) return 3;
  if (ageHours <= 72) return 2;
  if (ageHours <= 7 * 24) return 1;
  return 0;
}

function getDomain(link: string) {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function localRerank(query: string, items: SearchItem[]) {
  const rescored = items
    .map((item) => {
      const baseFinal = typeof item.finalScore === "number" ? item.finalScore : 0;
      const queryScore = queryMatchScore(query, item);
      const businessScore = businessSignalScore(item);
      const freshScore = freshnessScore(item);

      const boosted =
        baseFinal * 0.7 + queryScore * 1.4 + businessScore * 1.1 + freshScore * 0.8;

      return {
        ...item,
        finalScore: Math.round(boosted * 100) / 100,
      };
    })
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

  const unique: SearchItem[] = [];
  const domainSeen = new Map<string, number>();

  for (const item of rescored) {
    const duplicated = unique.some((picked) => isDuplicateStory(item, picked));
    if (duplicated) continue;

    const domain = item.sourceDomain || getDomain(item.link);
    const sameDomainCount = domainSeen.get(domain) || 0;

    if (sameDomainCount >= 3) continue;

    unique.push(item);
    domainSeen.set(domain, sameDomainCount + 1);

    if (unique.length >= 15) break;
  }

  return unique.length > 0 ? unique : rescored.slice(0, 15);
}

function fillRemainingWithUnique(base: SearchItem[], fallbackPool: SearchItem[], limit = 10) {
  const result = [...base];

  for (const item of fallbackPool) {
    const duplicated = result.some((picked) => isDuplicateStory(item, picked));
    if (duplicated) continue;

    result.push(item);
    if (result.length >= limit) break;
  }

  return result.slice(0, limit);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const items = Array.isArray(body?.items) ? (body.items as SearchItem[]) : [];

    if (!query) {
      return Response.json(
        {
          error: "query 값이 비어 있습니다.",
          items: [],
        },
        { status: 400 }
      );
    }

    if (!items.length) {
      return Response.json({
        items: [],
      });
    }

    const localRanked = localRerank(query, items);
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return Response.json({ items: localRanked.slice(0, 10) });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const prompt = `
너는 뉴스 편집자다.
아래 기사 후보들 중 중복 기사를 제거하고, 실무 관점에서 중요한 기사 10개를 우선순위로 골라라.
반드시 기사 index만 JSON 배열로 반환해라.

조건:
1. 같은 사건을 다룬 중복 기사는 하나만 남긴다.
2. 투자, 실적, 공급망, 협력, 정책, AI/반도체 산업 변화 기사 우선
3. 숫자와 사업 영향이 명확한 기사 우선
4. 최신 기사 우선
5. 가능하면 8~10개를 고른다.
6. JSON 형식:
{ "indexes": [0,1,2,3,4,5,6,7] }

검색어:
${query}

기사 후보:
${localRanked
  .map(
    (item, index) => `
[${index}]
제목: ${item.title}
요약: ${item.snippet}
발행일: ${item.pubDate}
도메인: ${item.sourceDomain || ""}
점수: ${item.finalScore || 0}
`
  )
  .join("\n")}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "";
      const parsed = JSON.parse(text) as { indexes?: number[] };

      if (!Array.isArray(parsed.indexes) || !parsed.indexes.length) {
        return Response.json({ items: localRanked.slice(0, 10) });
      }

      const selected = parsed.indexes
        .map((index) => localRanked[index])
        .filter(Boolean);

      const filled = fillRemainingWithUnique(selected, localRanked, 10);

      return Response.json({
        items: filled.length ? filled : localRanked.slice(0, 10),
      });
    } catch (error) {
      console.error("RERANK GEMINI FALLBACK:", error);
      return Response.json({ items: localRanked.slice(0, 10) });
    }
  } catch (error: any) {
    console.error("RERANK ERROR:", error);
    return Response.json(
      {
        error: error?.message || "재선별 중 오류가 발생했습니다.",
        items: [],
      },
      { status: 500 }
    );
  }
}
