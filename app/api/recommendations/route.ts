// app/api/recommendations/route.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";

type RecommendationItem = {
  keyword: string;
  reason: string;
};

const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

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
  savedQueries: { query: string; category: string | null }[];
  briefings: { query: string; categoryTag: string | null }[];
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
        ? "최근 저장/검색 이력에 자주 등장한 키워드입니다."
        : "최근 브리핑 및 기사 제목 흐름을 바탕으로 추천한 키워드입니다.",
  }));
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
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

    const fallback = buildRuleBasedRecommendations({
      savedQueries,
      briefings,
      newsTitles: news.map((x) => x.title),
    });

    if (!ai) {
      return Response.json({
        source: "RULE",
        data: fallback,
      });
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
${savedQueries.map((x) => `- ${x.query} (${x.category || "미분류"})`).join("\n")}

[최근 브리핑]
${briefings.map((x) => `- ${x.query} (${x.categoryTag || "미분류"})`).join("\n")}

[최근 기사 제목]
${news.map((x) => `- ${x.title}`).join("\n")}
`;

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
      return Response.json({
        source: "RULE",
        data: fallback,
      });
    }

    const cleaned = parsed.data
      .map((item) => ({
        keyword: String(item.keyword || "").trim(),
        reason: String(item.reason || "").trim(),
      }))
      .filter((item) => item.keyword)
      .slice(0, 5);

    if (!cleaned.length) {
      return Response.json({
        source: "RULE",
        data: fallback,
      });
    }

    return Response.json({
      source: "AI",
      data: cleaned,
    });
  } catch (error: any) {
    console.error("RECOMMENDATIONS ERROR:", error);

    return Response.json(
      {
        error: error?.message || "추천 키워드 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
