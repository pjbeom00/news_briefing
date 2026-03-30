// app/api/cron/daily-briefing/route.ts

import { runDailyBriefing } from "@/lib/auto-briefing";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    if (!cronSecret) {
      return Response.json(
        { error: "CRON_SECRET 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return unauthorized();
    }

    const result = await runDailyBriefing();

    return Response.json(result);
  } catch (error: any) {
    console.error("DAILY BRIEFING CRON ERROR:", error);

    return Response.json(
      { error: error?.message || "자동 브리핑 실행 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
