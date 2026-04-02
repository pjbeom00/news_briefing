// app/api/briefings/[id]/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function buildDetailResponse(briefing: {
  id: number;
  query: string;
  summary: string;
  categoryTag: string | null;
  sentTo: string | null;
  sentAt: Date | null;
  scheduledDate: Date | null;
  status: string;
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
}) {
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
    items: normalizedItems,
  };

  return {
    data: normalized,

    // 기존 화면 하위 호환
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

    console.log("BRIEFING DELETE REQUEST:", {
      rawId: params.id,
      briefingId,
    });

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

    console.log("BRIEFING DELETE SUCCESS:", { briefingId });

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
