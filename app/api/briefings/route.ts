// app/api/briefings/route.ts

// app/api/briefings/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || "30"), 100);

    const briefings = await prisma.briefing.findMany({
      orderBy: [{ scheduledDate: "desc" }, { id: "desc" }],
      take: limit,
      include: {
        items: {
          orderBy: { rankOrder: "asc" },
          include: {
            news: {
              select: {
                id: true,
                title: true,
                link: true,
                sourceQuery: true,
              },
            },
          },
        },
      },
    });

    return Response.json({
      data: briefings.map((briefing) => ({
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
        newsCount: briefing.items.length,
        topTitles: briefing.items.slice(0, 3).map((item) => item.news.title),
      })),
    });
  } catch (error: any) {
    console.error("BRIEFINGS GET ERROR:", error);

    return Response.json(
      {
        error: error?.message || "브리핑 목록 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
