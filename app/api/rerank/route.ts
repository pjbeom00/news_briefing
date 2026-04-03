// app/api/rerank/route.ts - Gemini JSON 재선별 최종본

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

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function getDomain(link: string) {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function jaccardSimilarity(a: string, b: string) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (!setA.size || !setB.size) return 0;

  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) intersection += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function isDuplicateTitle(a: string, b: string) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  if (!aa || !bb) return false;
  if (aa === bb) return true;
  if (aa.includes(bb) || bb.includes(aa)) return true;

  return jaccardSimilarity(aa, bb) >= 0.72;
}

function queryMatchScore(query: string, item: SearchItem) {
  const text = normalizeText(`${item.title} ${item.snippet}`);
  const tokens = tokenize(query);

  let score = 0;
  for (const token of tokens) {
    if (token.length <= 1) continue;
    if (text.includes(token)) score += 3;
  }

  const title = normalizeText(item.title);
  for (const token of tokens) {
    if (token.length <= 1) continue;
    if (title.includes(token)) score += 2;
  }

  return score;
}

function businessSignalScore(item: SearchItem) {
  const text = `${item.title} ${item.snippet}`;
  let score = 0;

  if (/투자|수주|실적|매출|제휴|협력|계약|공급|확대|출시|양산|증설/i.test(text)) {
    score += 4;
  }

  if (/\d+%|\d+억|\d+조|\d+만|\d+배/.test(text)) {
    score += 3;
  }

  return score;
}

function freshnessScore(item: SearchItem) {
  const pubTime = new Date(item.pubDate || "").getTime();
  if (!Number.isFinite(pubTime)) return 0;

  const ageHours = Math.max(0, (Date.now() - pubTime) / (1000 * 60 * 60));

  if (ageHours <= 12) return 5;
  if (ageHours <= 24) return 4;
  if (ageHours <= 72) return 3;
  if (ageHours <= 168) return 2;
  return 1;
}

function localRerank(query: string, items: SearchItem[]) {
  const deduped: SearchItem[] = [];
  const domainCount = new Map<string, number>();

  const sorted = [...items].map((item) => ({
    ...item,
    sourceDomain: item.sourceDomain || getDomain(item.link),
  }));

  for (const item of sorted) {
    const duplicated = deduped.some((existing) =>
      isDuplicateTitle(existing.title, item.title)
    );

    if (duplicated) continue;

    deduped.push(item);
  }

  const rescored = deduped.map((item) => {
    const domain = item.sourceDomain || "";
    const currentDomainCount = domainCount.get(domain) || 0;
    const diversityPenalty = currentDomainCount >= 2 ? currentDomainCount * 1.4 : 0;

    domainCount.set(domain, currentDomainCount + 1);

    const finalScore =
      queryMatchScore(query, item) +
      businessSignalScore(item) +
      freshnessScore(item) -
      diversityPenalty;

    return {
      ...item,
      diversityPenalty,
      finalScore,
    };
  });

  return rescored.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0)).slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = String(body?.query || "").trim();
    const items = Array.isArray(body?.items) ? (body.items as SearchItem[]) : [];

    if (!query) {
      return Response.json({ error: "query가 비어 있습니다." }, { status: 400 });
    }

    if (!items.length) {
      return Response.json({ items: [] });
    }

    const localRanked = localRerank(query, items);

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return Response.json({ items: localRanked });
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
5. JSON 형식:
{ "indexes": [0,1,2] }

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
        return Response.json({ items: localRanked });
      }

      const selected = parsed.indexes
        .map((index) => localRanked[index])
        .filter(Boolean)
        .slice(0, 10);

      return Response.json({ items: selected.length ? selected : localRanked });
    } catch (error) {
      console.error("RERANK GEMINI FALLBACK:", error);
      return Response.json({ items: localRanked });
    }
  } catch (error: any) {
    console.error("RERANK ERROR:", error);
    return Response.json(
      {
        error: error?.message || "재선별 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
