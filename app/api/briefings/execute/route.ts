// File: app/api/briefings/execute/route.ts
// (2026-04-11) 멀티 이메일(to: string[]) 완전 지원 적용

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExecuteBody = {
  query?: string;
  to?: string | string[];
  templateType?: "EXECUTIVE" | "PRACTICAL";
  category?: string | null;
  deliveryMode?: "SEND" | "DRAFT";
};

type SearchItem = {
  title: string;
  link: string;
  snippet: string;
  pubDate: string;
  sourceDomain?: string;
  keywordScore?: number;
  tfidfScore?: number;
  freshnessScore?: number;
  importanceScore?: number;
  diversityPenalty?: number;
  finalScore?: number;
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  const data = await parseJsonSafe(res);

  if (!res.ok) {
    throw new Error((data as any)?.error || `요청 실패: ${url}`);
  }

  return data;
}

export async function POST(request: Request) {
  let executionLogId: number | null = null;

  try {
    const body = (await request.json()) as ExecuteBody;

    // --------------------------------------------
    // 멀티 이메일 지원
    // --------------------------------------------
    let recipients: string[] = [];

    if (Array.isArray(body?.to)) {
      recipients = body.to;
    } else if (typeof body?.to === "string") {
      recipients = body.to
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (process.env.BRIEFING_TO_EMAIL) {
      recipients = process.env.BRIEFING_TO_EMAIL.split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }

    if (recipients.length === 0) {
      return Response.json(
        {
          error:
            "받는 이메일이 없습니다. 요청 본문에 to를 넣거나 BRIEFING_TO_EMAIL 환경변수를 설정하세요.",
        },
        { status: 400 }
      );
    }

    const query = String(body?.query || "").trim();
    if (!query) {
      return Response.json(
        { error: "query 값이 비어 있습니다." },
        { status: 400 }
      );
    }

    const templateType =
      String(body?.templateType || "EXECUTIVE").toUpperCase() === "PRACTICAL"
        ? "PRACTICAL"
        : "EXECUTIVE";

    const deliveryMode =
      String(body?.deliveryMode || "SEND").toUpperCase() === "DRAFT"
        ? "DRAFT"
        : "SEND";

    const category =
      body?.category === undefined
        ? null
        : String(body.category || "").trim() || null;

    // --------------------------------------------
    // execution log 생성
    // --------------------------------------------
    const createdLog = await prisma.briefingExecutionLog.create({
      data: {
        query,
        toEmail: recipients.join(", "),
        templateType,
        deliveryMode,
        category,
        status: "RUNNING",
      },
      select: { id: true },
    });

    executionLogId = createdLog.id;

    const origin = new URL(request.url).origin;

    // --------------------------------------------
    // 검색 단계
    // --------------------------------------------
    const searchData = await postJson(`${origin}/api/search`, { query });

    const searchedItems = Array.isArray((searchData as any)?.items)
      ? ((searchData as any).items as SearchItem[])
      : [];

    await prisma.briefingExecutionLog.update({
      where: { id: executionLogId },
      data: { searchedCount: searchedItems.length },
    });

    if (!searchedItems.length) {
      await prisma.briefingExecutionLog.update({
        where: { id: executionLogId },
        data: {
          status: "FAILED",
          errorMessage: "검색 결과가 없습니다.",
        },
      });

      return Response.json(
        { error: "검색 결과가 없습니다." },
        { status: 404 }
      );
    }

    const preRankedItems = searchedItems.slice(0, 20);

    let finalItems: SearchItem[] = preRankedItems.slice(0, 10);

    // --------------------------------------------
    // 재랭킹 STEP
    // --------------------------------------------
    try {
      const rerankData = await postJson(`${origin}/api/rerank`, {
        query,
        items: preRankedItems,
      });

      const reranked = Array.isArray((rerankData as any)?.items)
        ? ((rerankData as any).items as SearchItem[])
        : [];

      if (reranked.length) {
        finalItems = reranked.slice(0, 10);
      }
    } catch (rerankError) {
      console.error("ONE_CLICK_RERANK_FALLBACK:", rerankError);
    }

    await prisma.briefingExecutionLog.update({
      where: { id: executionLogId },
      data: { finalCount: finalItems.length },
    });

    // --------------------------------------------
    // 요약 생성
    // --------------------------------------------
    const summarizeData = await postJson(`${origin}/api/summarize`, {
      query,
      items: finalItems,
      category,
      templateType,
    });

    const summary = String((summarizeData as any)?.summary || "").trim();
    const structured = (summarizeData as any)?.structured || null;
    const briefingId = (summarizeData as any)?.briefingId ?? null;

    if (!summary) {
      await prisma.briefingExecutionLog.update({
        where: { id: executionLogId },
        data: {
          status: "FAILED",
          briefingId,
          errorMessage: "요약 생성에 실패했습니다.",
        },
      });

      return Response.json(
        { error: "요약 생성에 실패했습니다." },
        { status: 500 }
      );
    }

    // --------------------------------------------
    // 메일(DRAFT/SEND) 실행
    // --------------------------------------------
    const sendData = await postJson(`${origin}/api/send`, {
      to: recipients, // ← 멀티 이메일 그대로 전달
      summary,
      structured,
      items: finalItems,
      query,
      briefingId,
      category,
      templateType,
      deliveryMode,
    });

    // --------------------------------------------
    // 관리자 화면 링크 구성
    // --------------------------------------------
    const adminDetailUrl = briefingId
      ? `/admin/briefings?briefingId=${encodeURIComponent(String(briefingId))}`
      : "/admin/briefings";

    const adminListUrl = `/admin/briefings?query=${encodeURIComponent(query)}`;

    const gmailDraftsUrl =
      deliveryMode === "DRAFT"
        ? "https://mail.google.com/mail/u/0/#drafts"
        : null;

    // --------------------------------------------
    // execution Log SUCCESS 업데이트
    // --------------------------------------------
    await prisma.briefingExecutionLog.update({
      where: { id: executionLogId },
      data: {
        status: "SUCCESS",
        briefingId: briefingId || null,
        gmailMessageId: String((sendData as any)?.messageId || "") || null,
        gmailThreadId: String((sendData as any)?.threadId || "") || null,
        gmailDraftId: String((sendData as any)?.draftId || "") || null,
        adminDetailUrl,
        adminListUrl,
        gmailDraftsUrl,
        errorMessage: null,
      },
    });

    return Response.json({
      ok: true,
      query,
      recipients,
      templateType,
      deliveryMode,
      category,
      searchedCount: searchedItems.length,
      finalCount: finalItems.length,
      briefingId,
      executionLogId,
      sendResult: sendData,
      adminDetailUrl,
      adminListUrl,
      gmailDraftsUrl,
      message:
        deliveryMode === "DRAFT"
          ? "원클릭 브리핑 초안 생성이 완료되었습니다."
          : "원클릭 브리핑 실행이 완료되었습니다.",
    });
  } catch (error: any) {
    console.error("ONE_CLICK_BRIEFING_EXECUTE_ERROR:", error);

    if (executionLogId) {
      try {
        await prisma.briefingExecutionLog.update({
          where: { id: executionLogId },
          data: {
            status: "FAILED",
            errorMessage:
              error?.message || "원클릭 브리핑 실행 중 오류가 발생했습니다.",
          },
        });
      } catch (updateError) {
        console.error("EXECUTION_LOG_UPDATE_ERROR:", updateError);
      }
    }

    return Response.json(
      {
        error:
          error?.message || "원클릭 브리핑 실행 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}