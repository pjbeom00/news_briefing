// app/api/dashboard/route.ts
// (2026-04-03) : 대시보드 조회 추가

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getKstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function startOfKstDay(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth();
  const day = kst.getUTCDate();

  return new Date(Date.UTC(year, month, day, 0, 0, 0) - 9 * 60 * 60 * 1000);
}

function normalizeTemplateType(categoryTag?: string | null) {
  if (String(categoryTag || "").includes("PRACTICAL")) return "PRACTICAL";
  return "EXECUTIVE";
}

function isFavoriteBriefing(categoryTag?: string | null) {
  return String(categoryTag || "").split("_").includes("FAVORITE");
}

export async function GET() {
  try {
    const now = new Date();
    const todayStart = startOfKstDay(now);
    const sevenDaysAgo = getDateDaysAgo(7);
    const thirtyDaysAgo = getDateDaysAgo(30);

    const [
      todayBriefings,
      weekBriefings,
      recentSavedQueries,
      recentBriefings,
      allRecentBriefings,
      favoriteBriefings,
    ] = await Promise.all([
      prisma.briefing.findMany({
        where: {
          createdAt: {
            gte: todayStart,
          },
        },
        select: {
          id: true,
          status: true,
          query: true,
          categoryTag: true,
          sentAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.briefing.findMany({
        where: {
          createdAt: {
            gte: sevenDaysAgo,
          },
        },
        select: {
          id: true,
          status: true,
          query: true,
          categoryTag: true,
          sentAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.savedQuery.findMany({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
        select: {
          id: true,
          name: true,
          query: true,
          category: true,
          isFavorite: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 10,
      }),

      prisma.briefing.findMany({
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
        take: 10,
        select: {
          id: true,
          query: true,
          summary: true,
          categoryTag: true,
          sentTo: true,
          sentAt: true,
          status: true,
          errorMessage: true,
          createdAt: true,
        },
      }),

      prisma.briefing.findMany({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
        select: {
          id: true,
          query: true,
          status: true,
          categoryTag: true,
          sentAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.briefing.findMany({
        where: {
          categoryTag: {
            contains: "FAVORITE",
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 6,
        select: {
          id: true,
          query: true,
          summary: true,
          categoryTag: true,
          sentTo: true,
          sentAt: true,
          status: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
    ]);

    const todaySentCount = todayBriefings.filter(
      (item) => String(item.status || "").toUpperCase() === "SENT"
    ).length;

    const todayFailedCount = todayBriefings.filter(
      (item) => String(item.status || "").toUpperCase() === "FAILED"
    ).length;

    const weekSentCount = weekBriefings.filter(
      (item) => String(item.status || "").toUpperCase() === "SENT"
    ).length;

    const weekSuccessRate =
      weekBriefings.length > 0
        ? Math.round((weekSentCount / weekBriefings.length) * 100)
        : 0;

    const queryCounter = new Map<
      string,
      {
        query: string;
        count: number;
        sentCount: number;
      }
    >();

    for (const row of allRecentBriefings) {
      const key = row.query.trim();
      if (!key) continue;

      const current = queryCounter.get(key) || {
        query: key,
        count: 0,
        sentCount: 0,
      };

      current.count += 1;
      if (String(row.status || "").toUpperCase() === "SENT") {
        current.sentCount += 1;
      }

      queryCounter.set(key, current);
    }

    const topQueries = [...queryCounter.values()]
      .sort((a, b) => b.count - a.count || b.sentCount - a.sentCount)
      .slice(0, 7);

    const resendCandidates = [...queryCounter.values()]
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count || b.sentCount - a.sentCount)
      .slice(0, 5);

    const templateStats = {
      executive: allRecentBriefings.filter(
        (item) => normalizeTemplateType(item.categoryTag) === "EXECUTIVE"
      ).length,
      practical: allRecentBriefings.filter(
        (item) => normalizeTemplateType(item.categoryTag) === "PRACTICAL"
      ).length,
    };

    return Response.json({
      generatedAt: getKstNow().toISOString(),
      cards: {
        todaySentCount,
        todayFailedCount,
        weekBriefingCount: weekBriefings.length,
        weekSuccessRate,
        recentSavedQueryCount: recentSavedQueries.length,
        totalRecentBriefingCount: allRecentBriefings.length,
        favoriteBriefingCount: favoriteBriefings.length,
      },
      templateStats,
      topQueries,
      resendCandidates,
      recentSavedQueries,
      recentBriefings: recentBriefings.map((item) => ({
        ...item,
        isFavorite: isFavoriteBriefing(item.categoryTag),
      })),
      favoriteBriefings: favoriteBriefings.map((item) => ({
        ...item,
        isFavorite: true,
      })),
    });
  } catch (error: any) {
    console.error("DASHBOARD ERROR:", error);

    return Response.json(
      {
        error: error?.message || "대시보드 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}

