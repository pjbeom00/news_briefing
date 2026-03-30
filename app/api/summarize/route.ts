// app/api/summarize/route.ts - 마크다운 없는 메일 친화형 요약 생성 + Briefing/BriefingItem 저장까지 포함
// 2026-03-27 : 카테고리 선택값 저장 추가

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
}

const ai = new GoogleGenAI({ apiKey });

function detectCategoryTag(query: string, selectedCategory?: string) {
  if (selectedCategory && selectedCategory !== "전체") {
    return selectedCategory;
  }

  const terms = String(query || "")
    .replace(/[|,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!terms.length) return "뉴스";

  return terms.slice(0, 2).join(" · ");
}

export async function POST(req: Request) {
  try {
    const { items, query, category } = await req.json();

    if (!items || !Array.isArray(items) || !items.length) {
      return Response.json(
        { error: "요약할 기사 목록이 없습니다." },
        { status: 400 }
      );
    }

    const articleText = items
      .map(
        (item, index) => `
[기사 ${index + 1}]
제목: ${item.title || ""}
링크: ${item.link || ""}
요약: ${item.snippet || ""}
날짜: ${item.pubDate || ""}
`
      )
      .join("\n");

    const prompt = `
다음은 뉴스 기사 목록이다.
검색어: ${query || ""}

이 기사들을 바탕으로 한국어 뉴스 브리핑을 작성해라.

반드시 아래 규칙을 모두 지켜라.

[형식 규칙]
1. 출력은 일반 텍스트로만 작성한다.
2. 마크다운 문법(**, #, ##, ###, ---, >, 백틱 등)을 절대 사용하지 마라.
3. 문단과 문단 사이에는 반드시 한 줄을 비워라.
4. 불릿은 반드시 "- " 로 시작하라.
5. 각 문장은 너무 길지 않게 써라.
6. 메일로 바로 보내도 읽기 좋게 단정하게 써라.
7. 중복 내용은 합쳐서 정리하라.
8. 기사 번호를 직접 나열하기보다 핵심 내용을 중심으로 묶어라.
9. 기사에 없는 내용은 추측해서 쓰지 마라.
10. 특정 기업이 기사에서 언급되지 않았으면 그 기업은 쓰지 마라.

[출력 형식]
오늘의 핵심 동향
- ...
- ...
- ...

기사별 핵심 포인트
- ...
- ...
- ...
- ...
- ...

기업 관점 요약
- (기사에서 실제 언급된 기업만 작성)
- 예: 삼성: ...
- 예: SK hynix: ...
- 예: Micron: ...

마지막 코멘트
- 오늘 기사 흐름을 한 문장으로 요약

기사 목록:
${articleText}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const summaryText = response.text || "";
    const categoryTag = detectCategoryTag(query || "", category);

    const briefing = await prisma.briefing.create({
      data: {
        query: query || "",
        summary: summaryText,
        categoryTag,
      },
    });

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];

      const news = await prisma.news.upsert({
        where: { link: item.link },
        update: {
          title: item.title,
          snippet: item.snippet || null,
          pubDate: item.pubDate || null,
          sourceQuery: query || "",
        },
        create: {
          title: item.title,
          link: item.link,
          snippet: item.snippet || null,
          pubDate: item.pubDate || null,
          sourceQuery: query || "",
        },
      });

      await prisma.briefingItem.create({
        data: {
          briefingId: briefing.id,
          newsId: news.id,
          rankOrder: i + 1,
        },
      });
    }

    return Response.json({
      summary: summaryText,
      briefingId: briefing.id,
    });
  } catch (error: any) {
    console.error("GEMINI SUMMARY ERROR:", error);

    return Response.json(
      { error: error?.message || "Gemini 요약 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
