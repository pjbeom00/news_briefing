// app/api/briefings/[id]/resend/route.ts
// (2026-04-03) : 메일 재발송 시 템플릿 변경 기능 추가

import { resendBriefing } from "@/lib/briefing-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
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

    const body = await request.json().catch(() => ({}));
    const templateType = String(body?.templateType || "EXECUTIVE")
      .trim()
      .toUpperCase();

    const result = await resendBriefing(
      briefingId,
      templateType === "PRACTICAL" ? "PRACTICAL" : "EXECUTIVE"
    );

    if (!result.ok) {
      return Response.json(
        {
          error: result.reason || "브리핑 재발송에 실패했습니다.",
          ...result,
        },
        { status: 500 }
      );
    }

    return Response.json(result);
  } catch (error: any) {
    console.error("BRIEFING RESEND API ERROR:", error);

    return Response.json(
      {
        error: error?.message || "브리핑 재발송 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
