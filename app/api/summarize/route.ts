// app/api/summarize/route.ts - 마크다운 없는 메일 친화형 요약 생성 + Briefing/BriefingItem 저장까지 포함
// (2026-03-27) : 카테고리 선택값 저장 추가
// (2026-04-03) : 브리핑 템플릿 2종 (경영진용 요약형 / 실무자용 상세형)

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

function buildFallbackSummary(
  query: string,
  items: SearchItem[],
  templateType: BriefingTemplateType
): StructuredSummary {
  const topThree = items.slice(0, 3);

  if (templateType === "PRACTICAL") {
    return {
      trend: `${query} 관련 기사들을 종합하면 최근 주요 흐름이 반복적으로 수렴되고 있으며, 실무적으로 확인해야 할 변화 포인트가 명확해지고 있습니다.`,
      keyPoints: topThree.map(
        (item) => `${item.title} - ${item.snippet || "핵심 내용 확인 필요"}`
      ),
      companyInsight:
        "실무 관점에서는 단순 이슈 파악보다 공급망, 투자, 실적, 파트너십, 정책 변화가 실제 운영 영향으로 이어지는지 점검하는 것이 중요합니다.",
      comment:
        "유사 기사 간 중복을 걷어내고 핵심 기사 위주로 우선순위를 정하면 후속 판단 속도를 높일 수 있습니다.",
    };
  }

  return {
    trend: `${query} 관련 최근 기사들을 보면 핵심 이슈가 집중적으로 반복되고 있으며, 산업/기업 관점에서 확인이 필요한 변화가 이어지고 있습니다.`,
    keyPoints: topThree.map((item) => item.title).slice(0, 3),
    companyInsight:
      "기업 관점에서는 단순 뉴스 소비보다 실제 투자, 공급망, 실적, 파트너십 변화와 연결되는 포인트를 중심으로 보는 것이 중요합니다.",
    comment:
      "유사 기사가 반복되는 경우가 많으므로, 핵심 기사 몇 건을 중심으로 변화 방향과 사업 영향도를 함께 해석하는 것이 좋습니다.",
  };
}

function toSummaryText(structured: StructuredSummary) {
  return [
    `오늘의 핵심 동향: ${structured.trend}`,
    `핵심 포인트:`,
    ...structured.keyPoints.map((point) => `- ${point}`),
    `기업 관점: ${structured.companyInsight}`,
    `마지막 코멘트: ${structured.comment}`,
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = String(body?.query || "").trim();
    const items = Array.isArray(body?.items) ? (body.items as SearchItem[]) : [];
    const category = String(body?.category || "").trim() || null;
    const templateType = (
      String(body?.templateType || "EXECUTIVE").trim().toUpperCase() ===
      "PRACTICAL"
        ? "PRACTICAL"
        : "EXECUTIVE"
    ) as BriefingTemplateType;

    if (!query) {
      return Response.json({ error: "query가 비어 있습니다." }, { status: 400 });
    }

    if (!items.length) {
      return Response.json(
        { error: "요약할 기사 목록이 없습니다." },
        { status: 400 }
      );
    }

    let structured = buildFallbackSummary(query, items, templateType);

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const prompt =
          templateType === "PRACTICAL"
            ? `
너는 실무자용 뉴스 브리핑 분석가다.
아래 기사들을 종합해서 구조화된 한국어 브리핑을 작성해라.
단순 나열이 아니라 실무 관점 설명이 포함되어야 한다.

출력 형식(JSON):
{
  "trend": "오늘의 핵심 동향",
  "keyPoints": ["포인트1", "포인트2", "포인트3"],
  "companyInsight": "기업 관점 요약",
  "comment": "마지막 코멘트"
}

조건:
1. trend는 2~3문장
2. keyPoints는 4~5개
3. keyPoints는 기사별 핵심 포인트처럼 더 구체적으로
4. companyInsight는 실무 영향/운영 영향 중심
5. comment는 후속 검토 포인트 중심
6. 중복 기사는 하나의 흐름으로 묶기
7. 과장 금지
8. 한국어

검색어:
${query}

기사 목록:
${items
  .map(
    (item, index) => `
[${index + 1}]
제목: ${item.title}
요약: ${item.snippet}
발행일: ${item.pubDate}
`
  )
  .join("\n")}
`
            : `
너는 경영진용 뉴스 브리핑 분석가다.
아래 기사들을 종합해서 구조화된 한국어 브리핑을 작성해라.
단순 기사 나열이 아니라 전체 흐름과 시사점을 압축적으로 정리해라.

출력 형식(JSON):
{
  "trend": "오늘의 핵심 동향",
  "keyPoints": ["포인트1", "포인트2", "포인트3"],
  "companyInsight": "기업 관점 요약",
  "comment": "마지막 코멘트"
}

조건:
1. trend는 2~3문장
2. keyPoints는 3개
3. 기업 관점은 의사결정 포인트 중심
4. comment는 시사점 중심
5. 중복 기사는 하나의 흐름으로 묶기
6. 과장 금지
7. 한국어

검색어:
${query}

기사 목록:
${items
  .map(
    (item, index) => `
[${index + 1}]
제목: ${item.title}
요약: ${item.snippet}
발행일: ${item.pubDate}
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

        const parsed = JSON.parse(response.text || "{}") as StructuredSummary;

        if (parsed?.trend && Array.isArray(parsed?.keyPoints)) {
          structured = {
            trend: parsed.trend,
            keyPoints:
              templateType === "PRACTICAL"
                ? parsed.keyPoints.slice(0, 5)
                : parsed.keyPoints.slice(0, 3),
            companyInsight: parsed.companyInsight || "",
            comment: parsed.comment || "",
          };
        }
      } catch (error) {
        console.error("SUMMARIZE GEMINI FALLBACK:", error);
      }
    }

    const summary = toSummaryText(structured);

    const newsRows = [];
    for (const item of items) {
      const upserted = await prisma.news.upsert({
        where: { link: item.link },
        update: {
          title: item.title,
          snippet: item.snippet,
          pubDate: item.pubDate,
          sourceQuery: query,
        },
        create: {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          pubDate: item.pubDate,
          sourceQuery: query,
        },
      });

      newsRows.push(upserted);
    }

    const briefing = await prisma.briefing.create({
      data: {
        query,
        summary,
        categoryTag: category ? `${category}_${templateType}` : templateType,
      },
    });

    if (newsRows.length) {
      await prisma.briefingItem.createMany({
        data: newsRows.map((news, index) => ({
          briefingId: briefing.id,
          newsId: news.id,
          rankOrder: index + 1,
        })),
      });
    }

    return Response.json({
      briefingId: briefing.id,
      summary,
      structured,
      templateType,
    });
  } catch (error: any) {
    console.error("SUMMARIZE ERROR:", error);
    return Response.json(
      {
        error: error?.message || "요약 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
