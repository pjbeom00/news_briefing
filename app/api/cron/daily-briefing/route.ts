// app/api/cron/daily-briefing/route.ts
// (2026-04-01) Cron 자동 브리핑 기능 추가

import { getBriefingEnv } from "@/lib/env";
import { runDailyBriefing } from "@/lib/briefing-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    return "";
  }

  const prefix = "Bearer ";

  if (!authorizationHeader.startsWith(prefix)) {
    return "";
  }

  return authorizationHeader.slice(prefix.length).trim();
}

export async function GET(request: Request) {
  try {
    const { CRON_SECRET } = getBriefingEnv();

    const authorizationToken = getBearerToken(
      request.headers.get("authorization")
    );

    const headerToken =
      authorizationToken || request.headers.get("x-cron-secret") || "";

    if (headerToken !== CRON_SECRET) {
      return Response.json(
        {
          ok: false,
          message: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const result = await runDailyBriefing();

    return Response.json(result);
  } catch (error: any) {
    console.error("DAILY BRIEFING CRON ERROR:", error);

    return Response.json(
      {
        ok: false,
        message: error?.message || "자동 브리핑 실행 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
