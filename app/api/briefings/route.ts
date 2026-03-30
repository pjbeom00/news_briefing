// app/api/briefings/route.ts

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const briefings = await prisma.briefing.findMany({
      orderBy: {
        id: "desc",
      },
      take: 20,
      include: {
        items: {
          orderBy: {
            rankOrder: "asc",
          },
          include: {
            news: true,
          },
        },
      },
    });

    return Response.json({
      count: briefings.length,
      data: briefings,
    });
  } catch (error: any) {
    console.error("BRIEFINGS GET ERROR:", error);

    return Response.json(
      { error: error?.message || "브리핑 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
