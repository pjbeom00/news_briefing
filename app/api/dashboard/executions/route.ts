// File: app/api/dashboard/executions/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
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

function classifyFailureReason(errorMessage?: string | null) {
  const text = normalizeText(errorMessage || "");

  if (!text) return "기타";
  if (text.includes("quota") || text.includes("resource_exhausted") || text.includes("429")) {
    return "Gemini quota 초과";
  }
  if (text.includes("gmail") || text.includes("oauth") || text.includes("token")) {
    return "Gmail 인증/연동";
  }
  if (text.includes("검색 결과가 없습니다")) {
    return "검색 결과 없음";
  }
  if (text.includes("요약") || text.includes("summar")) {
    return "요약 생성 실패";
  }
  if (text.includes("send") || text.includes("mail") || text.includes("draft")) {
    return "메일 발송/초안 실패";
  }
  if (text.includes("rerank")) {
    return "재선별 실패";
  }

  return "기타";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const keyword = normalizeText(url.searchParams.get("keyword") || "");
    const status = String(url.searchParams.get("status") || "ALL").toUpperCase();
    const deliveryMode = String(url.searchParams.get("deliveryMode") || "ALL").toUpperCase();

    const rows = await prisma.briefingExecutionLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 300,
      include: {
        briefing: {
          select: {
            id: true,
            query: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    const filtered = rows.filter((row) => {
      const keywordMatched =
        !keyword ||
        `${row.query} ${row.toEmail || ""} ${row.category || ""} ${row.errorMessage || ""}`
          .toLowerCase()
          .includes(keyword);

      const statusMatched =
        status === "ALL" || String(row.status || "").toUpperCase() === status;

      const modeMatched =
        deliveryMode === "ALL" ||
        String(row.deliveryMode || "").toUpperCase() === deliveryMode;

      return keywordMatched && statusMatched && modeMatched;
    });

    const total = filtered.length;
    const successCount = filtered.filter((row) => row.status === "SUCCESS").length;
    const failedCount = filtered.filter((row) => row.status === "FAILED").length;
    const runningCount = filtered.filter((row) => row.status === "RUNNING").length;
    const draftCount = filtered.filter((row) => row.deliveryMode === "DRAFT").length;
    const sendCount = filtered.filter((row) => row.deliveryMode === "SEND").length;

    const dailyTrend = Array.from({ length: 7 }).map((_, index) => {
      const targetDate = getDateDaysAgo(6 - index);
      const dayKey = toDayKey(targetDate);

      const targetRows = filtered.filter(
        (row) => toDayKey(new Date(row.createdAt)) === dayKey
      );

      const success = targetRows.filter((row) => row.status === "SUCCESS").length;
      const failed = targetRows.filter((row) => row.status === "FAILED").length;
      const totalCount = targetRows.length;
      const successRate = totalCount > 0 ? Math.round((success / totalCount) * 100) : 0;

      return {
        day: dayKey,
        total: totalCount,
        success,
        failed,
        successRate,
      };
    });

    const failureReasonMap = new Map<string, number>();

    filtered
      .filter((row) => row.status === "FAILED")
      .forEach((row) => {
        const reason = classifyFailureReason(row.errorMessage);
        failureReasonMap.set(reason, (failureReasonMap.get(reason) || 0) + 1);
      });

    const failureReasons = [...failureReasonMap.entries()]
      .map(([reason, count]) => ({
        reason,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return Response.json({
      summary: {
        total,
        successCount,
        failedCount,
        runningCount,
        draftCount,
        sendCount,
      },
      charts: {
        dailyTrend,
        failureReasons,
      },
      data: filtered.map((row) => ({
        id: row.id,
        query: row.query,
        toEmail: row.toEmail,
        templateType: row.templateType,
        deliveryMode: row.deliveryMode,
        category: row.category,
        status: row.status,
        searchedCount: row.searchedCount,
        finalCount: row.finalCount,
        briefingId: row.briefingId,
        gmailMessageId: row.gmailMessageId,
        gmailThreadId: row.gmailThreadId,
        gmailDraftId: row.gmailDraftId,
        adminDetailUrl: row.adminDetailUrl,
        adminListUrl: row.adminListUrl,
        gmailDraftsUrl: row.gmailDraftsUrl,
        errorMessage: row.errorMessage,
        failureReason: classifyFailureReason(row.errorMessage),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error("DASHBOARD_EXECUTIONS_ERROR:", error);

    return Response.json(
      {
        error: error?.message || "원클릭 실행 로그 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
