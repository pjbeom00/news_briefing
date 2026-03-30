// app/api/briefings/[id]/route.ts

import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const briefing = await prisma.briefing.findUnique({
      where: {
        id: Number(id),
      },
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

    if (!briefing) {
      return Response.json(
        { error: "브리핑을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return Response.json(briefing);
  } catch (error: any) {
    console.error("BRIEFING DETAIL GET ERROR:", error);

    return Response.json(
      { error: error?.message || "브리핑 상세 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const briefingId = Number(id);

    const exists = await prisma.briefing.findUnique({
      where: {
        id: briefingId,
      },
      select: {
        id: true,
      },
    });

    if (!exists) {
      return Response.json(
        { error: "브리핑을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.briefing.delete({
      where: {
        id: briefingId,
      },
    });

    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("BRIEFING DELETE ERROR:", error);

    return Response.json(
      { error: error?.message || "브리핑 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
