// app/api/briefings/[id]/resend/route.ts
// (2026-04-04)
// - 여러 명에게 재발송할 수 있도록 sentTo 배열 처리 추가
// - templateType 유지
// - resendBriefing 호출 방식 개선 (여러 recipient 지원)

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
        { error: "유효하지 않은 브리핑 ID입니다." },
        { status: 400 }
      );
    }

    /* -----------------------------
     * Body 파싱
     ------------------------------*/
    const body = await request.json().catch(() => ({}));

    // 템플릿 타입
    const templateType = String(body?.templateType || "EXECUTIVE")
      .trim()
      .toUpperCase();

    // 여러 명 메일 전송용
    // body.recipients 없으면 null (기존 sentTo 사용)
    let recipients: string[] | null = null;

    if (Array.isArray(body?.recipients)) {
      recipients = body.recipients
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);

      if (recipients.length === 0) {
        return Response.json(
          { error: "recipients 배열이 비어 있습니다." },
          { status: 400 }
        );
      }
    }

    /* -----------------------------
     * resendBriefing 호출
     * (여러 이메일 지원)
     ------------------------------*/

    const result = await resendBriefing({
      briefingId,
      templateType: templateType === "PRACTICAL" ? "PRACTICAL" : "EXECUTIVE",
      recipients, // null이면 기존 sentTo 재사용
    });

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