// app/api/summarize/route.ts - 마크다운 없는 메일 친화형 요약 생성 + Briefing/BriefingItem 저장까지 포함
// (2026-03-27) : 카테고리 선택값 저장 추가
// (2026-04-03) : 브리핑 템플릿 2종 (경영진용 요약형 / 실무자용 상세형)
// (2026-04-07) 업그레이드 포인트:
// 1) 중복 기사들을 먼저 스토리 그룹으로 묶고 Gemini에 전달
// 2) trend / keyPoints / companyInsight / comment 품질 강화
// 3) fallback도 단순 기사 나열이 아니라 그룹 기반 요약

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchItem = {
  title: string;
  link: string;
  snippet: string;
  pubDate: string;
  sourceDomain?: string;
};

type StructuredSummary = {
  trend: string;
  keyPoints: string[];
  companyInsight: string;
  comment: string;
};

type BriefingTemplateType = "EXECUTIVE" | "PRACTICAL";

type StoryGroup = {
  representativeTitle: string;
  mergedSnippet: string;
  pubDate: string;
  sourceDomains: string[];
  articles: SearchItem[];
};

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

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

function mergeSnippets(snippets: string[]) {
  const unique = Array.from(
    new Set(
      snippets
        .map((snippet) => String(snippet || "").trim())
        .filter(Boolean)
    )
  );

  const result: string[] = [];

  for (const snippet of unique) {
    const duplicated = result.some((existing) => textSimilarity(existing, snippet) >= 0.8);
    if (!duplicated) {
      result.push(snippet);
    }
  }

  return result.join(" / ");
}

function groupStories(items: SearchItem[]) {
  const groups: StoryGroup[] = [];

  for (const item of items) {
    const matchedIndex = groups.findIndex((group) =>
      group.articles.some((article) => isDuplicateStory(article, item))
    );

    if (matchedIndex < 0) {
      groups.push({
        representativeTitle: item.title,
        mergedSnippet: item.snippet || "",
        pubDate: item.pubDate,
        sourceDomains: item.sourceDomain ? [item.sourceDomain] : [],
        articles: [item],
      });
      continue;
    }

    const group = groups[matchedIndex];
    group.articles.push(item);

    const mergedDomains = new Set([
      ...group.sourceDomains,
      ...(item.sourceDomain ? [item.sourceDomain] : []),
    ]);
    group.sourceDomains = Array.from(mergedDomains);

    const mergedSnippet = mergeSnippets(
      group.articles.map((article) => article.snippet || "")
    );
    group.mergedSnippet = mergedSnippet;

    const existingTime = new Date(group.pubDate || "").getTime();
    const candidateTime = new Date(item.pubDate || "").getTime();

    if (
      Number.isFinite(candidateTime) &&
      (!Number.isFinite(existingTime) || candidateTime > existingTime)
    ) {
      group.pubDate = item.pubDate;
      group.representativeTitle = item.title;
    }
  }

  return groups
    .sort((a, b) => {
      const bt = new Date(b.pubDate || "").getTime();
      const at = new Date(a.pubDate || "").getTime();
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    })
    .slice(0, 8);
}

function buildFallbackSummary(
  query: string,
  groups: StoryGroup[],
  templateType: BriefingTemplateType
): StructuredSummary {
  const topGroups = groups.slice(0, templateType === "PRACTICAL" ? 5 : 3);

  const trend =
    groups.length >= 2
      ? `${query} 관련 기사들을 종합하면, 동일 이슈가 여러 기사에서 반복되기보다 몇 개의 핵심 흐름으로 압축되고 있습니다. 특히 최근 기사들은 시장 변화와 운영 영향, 투자 및 공급망 변화에 초점이 맞춰져 있습니다.`
      : `${query} 관련 핵심 기사는 아직 많지 않지만, 현재 확인된 기사만으로도 주요 방향성과 후속 검토 포인트를 파악할 수 있습니다.`;

  const keyPoints = topGroups.map((group) => {
    const sourceText =
      group.sourceDomains.length > 0
        ? `출처 ${group.sourceDomains.slice(0, 3).join(", ")}`
        : "복수 기사 기준";
    const snippet = group.mergedSnippet || "세부 내용 추가 확인 필요";
    return `${group.representativeTitle} - ${snippet} (${sourceText})`;
  });

  const companyInsight =
    templateType === "PRACTICAL"
      ? "실무 관점에서는 기사별 중복을 걷어낸 뒤, 실제 운영 영향으로 이어질 수 있는 공급망 변화, 비용 구조, 투자 타이밍, 경쟁사 움직임을 우선 점검하는 것이 중요합니다."
      : "경영진 관점에서는 단일 기사보다 여러 기사에 반복적으로 나타나는 흐름을 기준으로 투자·리스크·전략 의사결정 포인트를 보는 것이 중요합니다.";

  const comment =
    templateType === "PRACTICAL"
      ? "후속으로는 중복 기사보다 각 스토리 그룹의 실제 영향 범위와 실행 우선순위를 재검토하는 것이 좋습니다."
      : "동일 흐름이 여러 기사에서 반복될수록 신호 강도가 높아질 수 있으므로, 핵심 스토리별 영향도를 중심으로 후속 판단이 필요합니다.";

  return {
    trend,
    keyPoints,
    companyInsight,
    comment,
  };
}

function sanitizeStructuredSummary(
  input: StructuredSummary,
  templateType: BriefingTemplateType
): StructuredSummary {
  const safeTrend = String(input?.trend || "").trim();
  const safeCompanyInsight = String(input?.companyInsight || "").trim();
  const safeComment = String(input?.comment || "").trim();

  const rawPoints = Array.isArray(input?.keyPoints) ? input.keyPoints : [];
  const cleanedPoints = rawPoints
    .map((point) => String(point || "").trim())
    .filter(Boolean);

  return {
    trend: safeTrend,
    keyPoints:
      templateType === "PRACTICAL"
        ? cleanedPoints.slice(0, 5)
        : cleanedPoints.slice(0, 3),
    companyInsight: safeCompanyInsight,
    comment: safeComment,
  };
}

function toSummaryText(structured: StructuredSummary) {
  const lines: string[] = [];

  lines.push(`오늘의 핵심 동향: ${structured.trend}`);

  if (structured.keyPoints.length) {
    lines.push("핵심 포인트:");
    for (const point of structured.keyPoints) {
      lines.push(`- ${point}`);
    }
  }

  lines.push(`기업 관점: ${structured.companyInsight}`);
  lines.push(`마지막 코멘트: ${structured.comment}`);

  return lines.join("\n");
}

function buildPrompt(
  query: string,
  groups: StoryGroup[],
  templateType: BriefingTemplateType
) {
  const groupedText = groups
    .map(
      (group, index) => `
[스토리 ${index + 1}]
대표 제목: ${group.representativeTitle}
핵심 요약: ${group.mergedSnippet}
발행일: ${group.pubDate}
출처: ${group.sourceDomains.join(", ") || "-"}
묶인 기사 수: ${group.articles.length}
`
    )
    .join("\n");

  if (templateType === "PRACTICAL") {
    return `
너는 실무자용 뉴스 브리핑 분석가다.
중복 기사들은 이미 하나의 스토리 그룹으로 묶여 있다.
아래 스토리 그룹을 바탕으로 실무 영향 중심의 구조화 브리핑을 한국어 JSON으로 작성해라.

출력 형식(JSON):
{
  "trend": "2~3문장",
  "keyPoints": ["4~5개, 기사별 핵심 포인트처럼 구체적", "..."],
  "companyInsight": "실무 영향/운영 영향 중심",
  "comment": "후속 검토 포인트 중심"
}

조건:
1. 과장 금지
2. 기사 나열 금지
3. 서로 같은 흐름인 스토리는 하나로 묶어 표현
4. trend는 전체 흐름을 종합한 문장이어야 함
5. keyPoints는 중복 없이 구체적으로
6. companyInsight는 공급망, 운영, 원가, 투자, 리스크 관점 반영
7. comment는 무엇을 더 확인해야 하는지 제시
8. 한국어

검색어:
${query}

스토리 그룹:
${groupedText}
`;
  }

  return `
너는 경영진용 뉴스 브리핑 분석가다.
중복 기사들은 이미 하나의 스토리 그룹으로 묶여 있다.
아래 스토리 그룹을 바탕으로 의사결정 관점의 구조화 브리핑을 한국어 JSON으로 작성해라.

출력 형식(JSON):
{
  "trend": "2~3문장",
  "keyPoints": ["3개, 핵심만 압축", "..."],
  "companyInsight": "의사결정 포인트 중심",
  "comment": "시사점 중심"
}

조건:
1. 과장 금지
2. 기사 나열 금지
3. 동일 흐름은 하나로 묶어서 표현
4. trend는 전체 흐름을 압축한 요약이어야 함
5. keyPoints는 3개만, 중복 없이
6. companyInsight는 투자·경쟁·리스크·전략 관점
7. comment는 한 줄 시사점이 아니라 실질 판단 포인트
8. 한국어

검색어:
${query}

스토리 그룹:
${groupedText}
`;
}

function categoryTag(category: string | null | undefined, templateType: BriefingTemplateType) {
  const base = String(category || "").trim() || "기타";
  return `${base}_${templateType}`;
}

async function ensureNewsRows(items: SearchItem[]) {
  return Promise.all(
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
          sourceQuery: item.sourceDomain || null,
        },
        update: {
          title: item.title,
          snippet: item.snippet,
          pubDate: item.pubDate,
          sourceQuery: item.sourceDomain || null,
        },
      })
    )
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const query = String(body?.query || "").trim();
    const items = Array.isArray(body?.items) ? (body.items as SearchItem[]) : [];
    const category = String(body?.category || "").trim() || null;
    const templateType =
      String(body?.templateType || "EXECUTIVE").toUpperCase() === "PRACTICAL"
        ? "PRACTICAL"
        : "EXECUTIVE";

    if (!query) {
      return Response.json(
        {
          error: "query 값이 비어 있습니다.",
        },
        { status: 400 }
      );
    }

    if (!items.length) {
      return Response.json(
        {
          error: "요약할 기사 목록이 없습니다.",
        },
        { status: 400 }
      );
    }

    const groups = groupStories(items);
    let structured = buildFallbackSummary(query, groups, templateType);

    if (ai) {
      try {
        const prompt = buildPrompt(query, groups, templateType);

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        const parsed = JSON.parse(response.text || "{}") as StructuredSummary;
        const sanitized = sanitizeStructuredSummary(parsed, templateType);

        if (sanitized.trend && sanitized.keyPoints.length) {
          structured = sanitized;
        }
      } catch (error) {
        console.error("SUMMARIZE GEMINI ERROR:", error);
      }
    }

    const summary = toSummaryText(structured);

    const newsRows = await ensureNewsRows(items);

    const briefing = await prisma.briefing.create({
      data: {
        query,
        summary,
        categoryTag: categoryTag(category, templateType),
        status: "PENDING",
      },
    });

    if (newsRows.length) {
      await prisma.briefingItem.createMany({
        data: newsRows.map((newsRow, index) => ({
          briefingId: briefing.id,
          newsId: newsRow.id,
          rankOrder: index + 1,
        })),
        skipDuplicates: true,
      });
    }

    return Response.json({
      ok: true,
      briefingId: briefing.id,
      summary,
      structured,
    });
  } catch (error: any) {
    console.error("SUMMARIZE API ERROR:", error);

    return Response.json(
      {
        error: error?.message || "요약 생성 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
