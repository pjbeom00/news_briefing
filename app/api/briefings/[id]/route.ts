// app/api/briefings/[id]/route.ts
// (2026-04-03) : 브리핑 상세 구조화 요약 카드 표시

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseStructuredSummaryFromText(text: string) {
  const raw = String(text || "").trim();

  if (!raw) {
    return {
      trend: "",
      keyPoints: [],
      companyInsight: "",
      comment: "",
    };
  }

  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let trend = "";
  let companyInsight = "";
  let comment = "";
  const keyPoints: string[] = [];

  for (const line of lines) {
    if (line.startsWith("오늘의 핵심 동향")) {
      trend = line.replace(/^오늘의 핵심 동향[:：]?\s*/u, "").trim();
      continue;
    }

    if (line.startsWith("핵심 포인트")) {
      const cleaned = line.replace(/^핵심 포인트[:：]?\s*/u, "").trim();
      if (cleaned) keyPoints.push(cleaned);
      continue;
    }

    if (line.startsWith("- ")) {
      keyPoints.push(line.replace(/^- /, "").trim());
      continue;
    }

    if (line.startsWith("기업 관점")) {
      companyInsight = line.replace(/^기업 관점[:：]?\s*/u, "").trim();
      continue;
    }

    if (line.startsWith("마지막 코멘트")) {
      comment = line.replace(/^마지막 코멘트[:：]?\s*/u, "").trim();
      continue;
    }
  }

  if (!trend) {
    trend = lines[0] || "";
  }

  return {
    trend,
    keyPoints: keyPoints.slice(0, 5),
    companyInsight,
    comment,
  };
}

function inferTemplateType(categoryTag?: string | null) {
  if (String(categoryTag || "").includes("PRACTICAL")) return "PRACTICAL";
  return "EXECUTIVE";
}

type DetailShape = {
  id: number;
  query: string;
  summary: string;
  categoryTag: string | null;
  sentTo: string | null;
  sentAt: Date | null;
  scheduledDate: Date | null;
  status: string | null;
  errorMessage: string | null;
  createdAt: Date;
  items: Array<{
    id: number;
    rankOrder: number;
    news: {
      id: number;
      title: string;
      link: string;
      snippet: string | null;
      summary: string | null;
      pubDate: string | null;
      sourceQuery: string | null;
      createdAt: Date;
    };
  }>;
};

function buildDetailResponse(briefing: DetailShape) {
  const normalizedItems = Array.isArray(briefing.items)
    ? briefing.items.map((item) => ({
        id: item.id,
        rankOrder: item.rankOrder,
        news: {
          id: item.news.id,
          title: item.news.title,
          link: item.news.link,
          snippet: item.news.snippet,
          summary: item.news.summary,
          pubDate: item.news.pubDate,
          sourceQuery: item.news.sourceQuery,
          createdAt: item.news.createdAt,
        },
      }))
    : [];

  const normalized = {
    id: briefing.id,
    query: briefing.query,
    summary: briefing.summary,
    categoryTag: briefing.categoryTag,
    sentTo: briefing.sentTo,
    sentAt: briefing.sentAt,
    scheduledDate: briefing.scheduledDate,
    status: briefing.status,
    errorMessage: briefing.errorMessage,
    createdAt: briefing.createdAt,
    templateType: inferTemplateType(briefing.categoryTag),
    structured: parseStructuredSummaryFromText(briefing.summary),
    items: normalizedItems,
  };

  return {
    data: normalized,
    id: normalized.id,
    query: normalized.query,
    summary: normalized.summary,
    categoryTag: normalized.categoryTag,
    sentTo: normalized.sentTo,
    sentAt: normalized.sentAt,
    scheduledDate: normalized.scheduledDate,
    status: normalized.status,
    errorMessage: normalized.errorMessage,
    createdAt: normalized.createdAt,
    templateType: normalized.templateType,
    structured: normalized.structured,
    items: normalized.items,
  };
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const briefingId = Number(params.id);

    if (!Number.isFinite(briefingId)) {
      return Response.json(
        {
          error: "유효하지 않은 브리핑 ID입니다.",
          data: null,
          items: [],
        },
        { status: 400 }
      );
    }

    const briefing = await prisma.briefing.findUnique({
      where: { id: briefingId },
      include: {
        items: {
          orderBy: { rankOrder: "asc" },
          include: {
            news: true,
          },
        },
      },
    });

    if (!briefing) {
      return Response.json(
        {
          error: "브리핑을 찾을 수 없습니다.",
          data: null,
          items: [],
        },
        { status: 404 }
      );
    }

    return Response.json(buildDetailResponse(briefing));
  } catch (error: any) {
    console.error("BRIEFING DETAIL ERROR:", error);

    return Response.json(
      {
        error: error?.message || "브리핑 상세 조회 중 오류가 발생했습니다.",
        data: null,
        items: [],
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const briefingId = Number(params.id);

    if (!Number.isFinite(briefingId)) {
      return Response.json(
        {
          error: "유효하지 않은 브리핑 ID입니다.",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.briefing.findUnique({
      where: { id: briefingId },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return Response.json(
        {
          error: "브리핑을 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.briefingItem.deleteMany({
        where: {
          briefingId,
        },
      });

      await tx.briefing.delete({
        where: {
          id: briefingId,
        },
      });
    });

    return Response.json({
      ok: true,
      id: briefingId,
      message: "브리핑이 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("BRIEFING DELETE ERROR:", error);

    return Response.json(
      {
        error: error?.message || "브리핑 삭제 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
