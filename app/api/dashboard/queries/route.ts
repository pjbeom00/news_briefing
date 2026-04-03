// app/api/dashboard/queries/route.ts

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

  if (raw.includes("_")) {
    const parts = raw.split("_").filter(Boolean);
    if (parts.length >= 1) {
      const base = parts[0];
      if (base === "DAILY") return "자동브리핑";
      return base;
    }
  }

  return raw;
}

export async function GET() {
  try {
    const [briefings, savedQueries] = await Promise.all([
      prisma.briefing.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          query: true,
          status: true,
          categoryTag: true,
          createdAt: true,
          sentAt: true,
          sentTo: true,
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
        savedQueryId: number | null;
        savedQueryName: string | null;
        savedQueryCategory: string | null;
        savedQueryFavorite: boolean;
      }
    >();

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
    }

    const rows = [...performanceMap.values()]
      .map((item) => {
        const topCategory =
          [...item.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "기타";

        const successRate =
          item.totalBriefings > 0
            ? Math.round((item.sentCount / item.totalBriefings) * 100)
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

    return Response.json({
      data: rows,
      total: rows.length,
    });
  } catch (error: any) {
    console.error("DASHBOARD QUERY STATS ERROR:", error);

    return Response.json(
      {
        error: error?.message || "검색어 성과 분석 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
