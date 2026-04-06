// app/api/dashboard/queries/route.ts
// (2026-04-06) File: app/api/dashboard/queries/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeTemplateType(categoryTag?: string | null) {
  if (String(categoryTag || "").includes("PRACTICAL")) return "PRACTICAL";
  return "EXECUTIVE";
}

function extractBaseCategory(categoryTag?: string | null) {
  const raw = String(categoryTag || "").trim();
  if (!raw) return "기타";

  const parts = raw.split("_").filter(Boolean);
  const filtered = parts.filter(
    (part) =>
      part !== "FAVORITE" &&
      part !== "EXECUTIVE" &&
      part !== "PRACTICAL" &&
      part !== "AUTO"
  );

  if (filtered.length === 0) {
    if (raw.includes("DAILY")) return "자동브리핑";
    return "기타";
  }

  return filtered[0];
}

function getDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function toDayKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTitleForDup(title: string) {
  return String(title || "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^\)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calcDuplicateQualityScore(titles: string[]) {
  const normalized = titles
    .map(normalizeTitleForDup)
    .filter(Boolean);

  if (normalized.length === 0) {
    return {
      duplicateQualityScore: 100,
      duplicateCount: 0,
      totalArticleCount: 0,
    };
  }

  const counts = new Map<string, number>();

  for (const title of normalized) {
    counts.set(title, (counts.get(title) || 0) + 1);
  }

  let duplicateCount = 0;

  for (const count of counts.values()) {
    if (count > 1) {
      duplicateCount += count - 1;
    }
  }

  const totalArticleCount = normalized.length;
  const duplicateRatio = totalArticleCount > 0 ? duplicateCount / totalArticleCount : 0;
  const duplicateQualityScore = Math.max(
    0,
    Math.round((1 - duplicateRatio) * 100)
  );

  return {
    duplicateQualityScore,
    duplicateCount,
    totalArticleCount,
  };
}

export async function GET() {
  try {
    const sevenDaysAgo = getDateDaysAgo(7);

    const [briefings, savedQueries] = await Promise.all([
      prisma.briefing.findMany({
        orderBy: { createdAt: "desc" },
        take: 180,
        select: {
          id: true,
          query: true,
          status: true,
          categoryTag: true,
          createdAt: true,
          sentAt: true,
          sentTo: true,
          items: {
            orderBy: {
              rankOrder: "asc",
            },
            select: {
              id: true,
              rankOrder: true,
              news: {
                select: {
                  id: true,
                  title: true,
                  link: true,
                },
              },
            },
          },
        },
      }),
      prisma.savedQuery.findMany({
        select: {
          id: true,
          name: true,
          query: true,
          category: true,
          isFavorite: true,
          updatedAt: true,
        },
      }),
    ]);

    const savedQueryMap = new Map(
      savedQueries.map((item) => [
        item.query.trim(),
        {
          id: item.id,
          name: item.name,
          query: item.query,
          category: item.category,
          isFavorite: item.isFavorite,
          updatedAt: item.updatedAt,
        },
      ])
    );

    const performanceMap = new Map<
      string,
      {
        query: string;
        totalBriefings: number;
        sentCount: number;
        failedCount: number;
        pendingCount: number;
        lastUsedAt: Date | null;
        templates: {
          executive: number;
          practical: number;
        };
        categories: Map<string, number>;
        duplicateQualityScores: number[];
        duplicateCounts: number[];
        articleCounts: number[];
        savedQueryId: number | null;
        savedQueryName: string | null;
        savedQueryCategory: string | null;
        savedQueryFavorite: boolean;
      }
    >();

    const dailyCountMap = new Map<string, number>();
    const dailySentMap = new Map<string, number>();

    for (const briefing of briefings) {
      const key = briefing.query.trim();
      if (!key) continue;

      const savedQueryInfo = savedQueryMap.get(key);

      if (!performanceMap.has(key)) {
        performanceMap.set(key, {
          query: key,
          totalBriefings: 0,
          sentCount: 0,
          failedCount: 0,
          pendingCount: 0,
          lastUsedAt: briefing.createdAt,
          templates: {
            executive: 0,
            practical: 0,
          },
          categories: new Map<string, number>(),
          duplicateQualityScores: [],
          duplicateCounts: [],
          articleCounts: [],
          savedQueryId: savedQueryInfo?.id ?? null,
          savedQueryName: savedQueryInfo?.name ?? null,
          savedQueryCategory: savedQueryInfo?.category ?? null,
          savedQueryFavorite: savedQueryInfo?.isFavorite ?? false,
        });
      }

      const row = performanceMap.get(key)!;
      row.totalBriefings += 1;

      const status = String(briefing.status || "").toUpperCase();
      if (status === "SENT") row.sentCount += 1;
      else if (status === "FAILED") row.failedCount += 1;
      else row.pendingCount += 1;

      if (!row.lastUsedAt || briefing.createdAt > row.lastUsedAt) {
        row.lastUsedAt = briefing.createdAt;
      }

      const templateType = normalizeTemplateType(briefing.categoryTag);
      if (templateType === "PRACTICAL") row.templates.practical += 1;
      else row.templates.executive += 1;

      const category = extractBaseCategory(briefing.categoryTag);
      row.categories.set(category, (row.categories.get(category) || 0) + 1);

      const titles = briefing.items.map((item) => item.news?.title || "").filter(Boolean);
      const dupStats = calcDuplicateQualityScore(titles);

      row.duplicateQualityScores.push(dupStats.duplicateQualityScore);
      row.duplicateCounts.push(dupStats.duplicateCount);
      row.articleCounts.push(dupStats.totalArticleCount);

      if (briefing.createdAt >= sevenDaysAgo) {
        const dayKey = toDayKey(briefing.createdAt);
        dailyCountMap.set(dayKey, (dailyCountMap.get(dayKey) || 0) + 1);

        if (status === "SENT") {
          dailySentMap.set(dayKey, (dailySentMap.get(dayKey) || 0) + 1);
        }
      }
    }

    const rows = [...performanceMap.values()]
      .map((item) => {
        const topCategory =
          [...item.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "기타";

        const successRate =
          item.totalBriefings > 0
            ? Math.round((item.sentCount / item.totalBriefings) * 100)
            : 0;

        const averageDuplicateQualityScore =
          item.duplicateQualityScores.length > 0
            ? Math.round(
                item.duplicateQualityScores.reduce((sum, value) => sum + value, 0) /
                  item.duplicateQualityScores.length
              )
            : 100;

        const averageDuplicateCount =
          item.duplicateCounts.length > 0
            ? Math.round(
                (item.duplicateCounts.reduce((sum, value) => sum + value, 0) /
                  item.duplicateCounts.length) *
                  10
              ) / 10
            : 0;

        const averageArticleCount =
          item.articleCounts.length > 0
            ? Math.round(
                (item.articleCounts.reduce((sum, value) => sum + value, 0) /
                  item.articleCounts.length) *
                  10
              ) / 10
            : 0;

        return {
          query: item.query,
          totalBriefings: item.totalBriefings,
          sentCount: item.sentCount,
          failedCount: item.failedCount,
          pendingCount: item.pendingCount,
          successRate,
          lastUsedAt: item.lastUsedAt?.toISOString() || null,
          templateExecutiveCount: item.templates.executive,
          templatePracticalCount: item.templates.practical,
          topCategory,
          duplicateQualityScore: averageDuplicateQualityScore,
          averageDuplicateCount,
          averageArticleCount,
          savedQueryId: item.savedQueryId,
          savedQueryName: item.savedQueryName,
          savedQueryCategory: item.savedQueryCategory,
          savedQueryFavorite: item.savedQueryFavorite,
        };
      })
      .sort((a, b) => {
        if (b.totalBriefings !== a.totalBriefings) {
          return b.totalBriefings - a.totalBriefings;
        }
        return (
          new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
        );
      });

    const topQueries = rows.slice(0, 7).map((item) => ({
      label: item.savedQueryName || item.query,
      value: item.totalBriefings,
    }));

    const successRateTop = [...rows]
      .filter((item) => item.totalBriefings > 0)
      .sort((a, b) => b.successRate - a.successRate || b.totalBriefings - a.totalBriefings)
      .slice(0, 7)
      .map((item) => ({
        label: item.savedQueryName || item.query,
        value: item.successRate,
      }));

    const duplicateQualityTop = [...rows]
      .sort(
        (a, b) =>
          b.duplicateQualityScore - a.duplicateQualityScore ||
          b.totalBriefings - a.totalBriefings
      )
      .slice(0, 7)
      .map((item) => ({
        label: item.savedQueryName || item.query,
        value: item.duplicateQualityScore,
      }));

    const templateDistribution = [
      {
        label: "경영진용",
        value: rows.reduce((sum, row) => sum + row.templateExecutiveCount, 0),
      },
      {
        label: "실무형",
        value: rows.reduce((sum, row) => sum + row.templatePracticalCount, 0),
      },
    ];

    const dailyTrend = Array.from({ length: 7 }).map((_, index) => {
      const date = getDateDaysAgo(6 - index);
      const key = toDayKey(date);
      const count = dailyCountMap.get(key) || 0;
      const sent = dailySentMap.get(key) || 0;
      const successRate = count > 0 ? Math.round((sent / count) * 100) : 0;

      return {
        day: key,
        count,
        sent,
        successRate,
      };
    });

    return Response.json({
      data: rows,
      total: rows.length,
      charts: {
        topQueries,
        successRateTop,
        duplicateQualityTop,
        templateDistribution,
        dailyTrend,
      },
    });
  } catch (error: any) {
    console.error("DASHBOARD_QUERY_STATS_ERROR:", error);

    return Response.json(
      {
        error: error?.message || "검색어 성과 분석 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
