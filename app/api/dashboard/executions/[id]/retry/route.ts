// File: app/api/dashboard/executions/[id]/retry/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
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

export async function POST(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const id = Number(params.id);

    if (!Number.isFinite(id)) {
      return Response.json(
        {
          error: "유효하지 않은 실행 로그 ID입니다.",
        },
        { status: 400 }
      );
    }

    const executionLog = await prisma.briefingExecutionLog.findUnique({
      where: {
        id,
      },
    });

    if (!executionLog) {
      return Response.json(
        {
          error: "실행 로그를 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    const origin = new URL(request.url).origin;

    const response = await fetch(`${origin}/api/briefings/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: executionLog.query,
        to: executionLog.toEmail || undefined,
        templateType:
          String(executionLog.templateType || "").toUpperCase() === "PRACTICAL"
            ? "PRACTICAL"
            : "EXECUTIVE",
        category: executionLog.category || null,
        deliveryMode:
          String(executionLog.deliveryMode || "").toUpperCase() === "DRAFT"
            ? "DRAFT"
            : "SEND",
      }),
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      return Response.json(
        {
          error: (data as any).error || "재실행 중 오류가 발생했습니다.",
        },
        { status: response.status }
      );
    }

    return Response.json({
      ok: true,
      retriedFromExecutionLogId: id,
      result: data,
    });
  } catch (error: any) {
    console.error("EXECUTION_RETRY_ERROR:", error);

    return Response.json(
      {
        error: error?.message || "재실행 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
