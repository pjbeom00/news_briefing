// app/api/test-gemini/route.ts

import { NextRequest, NextResponse } from "next/server";
import { generateTextWithRetry } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, message: "prompt 값이 필요합니다." },
        { status: 400 }
      );
    }

    const text = await generateTextWithRetry({
      prompt,
      model: "gemini-2.5-flash",
      maxRetries: 2,
    });

    return NextResponse.json({
      success: true,
      text,
    });
  } catch (error) {
    console.error("[TEST_GEMINI_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "알 수 없는 오류",
      },
      { status: 500 }
    );
  }
}
