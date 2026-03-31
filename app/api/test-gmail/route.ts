// app/api/test-gmail/route.ts

import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/gmail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const to = body?.to;
    const subject = body?.subject ?? "테스트 메일";
    const html = body?.html ?? "<p>테스트 메일입니다.</p>";

    if (!to || typeof to !== "string") {
      return NextResponse.json(
        { success: false, message: "to 값이 필요합니다." },
        { status: 400 }
      );
    }

    const result = await sendMail({
      to,
      subject,
      html,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[TEST_GMAIL_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      { status: 500 }
    );
  }
}
