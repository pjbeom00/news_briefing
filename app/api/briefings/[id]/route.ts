// app/api/briefings/[id]/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
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
        },
        { status: 404 }
      );
    }

    return Response.json({
      data: {
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
        items: briefing.items.map((item) => ({
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
        })),
      },
    });
  } catch (error: any) {
    console.error("BRIEFING DETAIL ERROR:", error);

    return Response.json(
      {
        error: error?.message || "브리핑 상세 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
