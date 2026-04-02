// app/api/recommendations/route.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecommendationItem = {
  keyword: string;
  reason: string;
};

type SavedQueryRow = {
  query: string;
  category: string | null;
};

type BriefingRow = {
  query: string;
  categoryTag: string | null;
};

type NewsRow = {
  title: string;
};

type RecommendationResponse = {
  source: "AI" | "RULE" | "CACHE";
  data: RecommendationItem[];
};

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const CACHE_TTL_MS = 60 * 1000;

let cachedResponse: RecommendationResponse | null = null;
let cachedAt = 0;

function normalizeText(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[|,/]+/g, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
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

function extractTopTerms(values: string[], limit = 10) {
  const stopWords = getStopWords();
  const scoreMap = new Map<string, number>();

  for (const value of values) {
    const tokens = tokenize(value);
    for (const token of tokens) {
      if (token.length <= 1) continue;
      if (stopWords.has(token)) continue;
      scoreMap.set(token, (scoreMap.get(token) || 0) + 1);
    }
  }

  return [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

function buildRuleBasedRecommendations(input: {
  savedQueries: SavedQueryRow[];
  briefings: BriefingRow[];
  newsTitles: string[];
}) {
  const queryTerms = extractTopTerms(input.savedQueries.map((x) => x.query), 6);
  const briefingTerms = extractTopTerms(input.briefings.map((x) => x.query), 6);
  const titleTerms = extractTopTerms(input.newsTitles, 8);

  const merged = Array.from(new Set([...queryTerms, ...briefingTerms, ...titleTerms]))
    .filter(Boolean)
    .slice(0, 5);

  return merged.map((keyword, index) => ({
    keyword,
    reason:
      index < 2
        ? "최근 검색에 자주 등장한 키워드"
        : "최근 브리핑 흐름 바탕 下 추천 키워드",
  }));
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 429
  ) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string"
  ) {
    const message = (error as { message: string }).message;

    return (
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("Quota exceeded") ||
      message.includes('"code":429')
    );
  }

  return false;
}

export async function GET() {
  const now = Date.now();

  try {
    if (cachedResponse && now - cachedAt < CACHE_TTL_MS) {
      return Response.json(cachedResponse);
    }

    const [savedQueries, briefings, news] = await Promise.all([
      prisma.savedQuery.findMany({
        orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
        take: 20,
        select: {
          query: true,
          category: true,
        },
      }),
      prisma.briefing.findMany({
        orderBy: { id: "desc" },
        take: 20,
        select: {
          query: true,
          categoryTag: true,
        },
      }),
      prisma.news.findMany({
        orderBy: { id: "desc" },
        take: 30,
        select: {
          title: true,
        },
      }),
    ]);

    const fallbackData = buildRuleBasedRecommendations({
      savedQueries,
      briefings,
      newsTitles: news.map((x: NewsRow) => x.title),
    });

    const fallbackResponse: RecommendationResponse = {
      source: "RULE",
      data: fallbackData,
    };

    if (!ai) {
      cachedResponse = fallbackResponse;
      cachedAt = now;
      return Response.json(fallbackResponse);
    }

    const prompt = `
너는 뉴스 키워드 추천 시스템이다.
아래 사용자 최근 활동을 바탕으로, 다음에 검색하면 좋을 추천 키워드 5개를 한국어로 제안해라.

조건:
1. keyword는 짧고 검색 가능한 형태여야 한다.
2. 너무 일반적인 단어만 쓰지 마라.
3. 최근 관심사의 연장선이어야 한다.
4. reason은 한 줄 설명으로 작성한다.
5. JSON만 반환한다.

[최근 저장 키워드]
${savedQueries.map((x: SavedQueryRow) => `- ${x.query} (${x.category || "미분류"})`).join("\n")}

[최근 브리핑]
${briefings.map((x: BriefingRow) => `- ${x.query} (${x.categoryTag || "미분류"})`).join("\n")}

[최근 기사 제목]
${news.map((x: NewsRow) => `- ${x.title}`).join("\n")}
`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["keyword", "reason"],
                },
              },
            },
            required: ["data"],
          },
        },
      });

      const text = response.text || "";
      const parsed = safeJsonParse<{ data: RecommendationItem[] }>(text);

      if (!parsed || !Array.isArray(parsed.data) || !parsed.data.length) {
        cachedResponse = fallbackResponse;
        cachedAt = now;
        return Response.json(fallbackResponse);
      }

      const cleaned = parsed.data
        .map((item) => ({
          keyword: String(item.keyword || "").trim(),
          reason: String(item.reason || "").trim(),
        }))
        .filter((item) => item.keyword)
        .slice(0, 5);

      if (!cleaned.length) {
        cachedResponse = fallbackResponse;
        cachedAt = now;
        return Response.json(fallbackResponse);
      }

      const aiResponse: RecommendationResponse = {
        source: "AI",
        data: cleaned,
      };

      cachedResponse = aiResponse;
      cachedAt = now;

      return Response.json(aiResponse);
    } catch (error: unknown) {
      if (isQuotaError(error)) {
        console.error("RECOMMENDATIONS QUOTA FALLBACK:", error);
        cachedResponse = fallbackResponse;
        cachedAt = now;
        return Response.json(fallbackResponse);
      }

      throw error;
    }
  } catch (error: any) {
    console.error("RECOMMENDATIONS ERROR:", error);

    const safeResponse: RecommendationResponse = {
      source: "RULE",
      data: [],
    };

    return Response.json(safeResponse);
  }
}
