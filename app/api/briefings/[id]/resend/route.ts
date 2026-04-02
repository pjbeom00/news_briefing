// app/api/briefings/[id]/resend/route.ts

import { resendBriefing } from "@/lib/briefing-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
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

    const result = await resendBriefing(briefingId);

    if (!result.ok) {
      return Response.json(result, { status: 400 });
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
