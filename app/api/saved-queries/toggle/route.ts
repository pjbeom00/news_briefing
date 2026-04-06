// app/api/savaed-queries/toggle/route.ts
// (2026-04-06) File: app/api/saved-queries/toggle/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToggleBody = {
  query?: string;
  name?: string;
  category?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ToggleBody;
    const query = String(body?.query || "").trim();
    const name = String(body?.name || query).trim();
    const category =
      body?.category === undefined ? null : String(body.category || "").trim() || null;

    if (!query) {
      return Response.json(
        {
          error: "query 값이 비어 있습니다.",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.savedQuery.findFirst({
      where: {
        query,
      },
    });

    if (!existing) {
      const created = await prisma.savedQuery.create({
        data: {
          name: name || query,
          query,
          category,
          isFavorite: true,
        },
      });

      return Response.json({
        ok: true,
        action: "CREATED_AND_FAVORITED",
        data: created,
      });
    }

    const updated = await prisma.savedQuery.update({
      where: {
        id: existing.id,
      },
      data: {
        isFavorite: !existing.isFavorite,
      },
    });

    return Response.json({
      ok: true,
      action: updated.isFavorite ? "FAVORITED" : "UNFAVORITED",
      data: updated,
    });
  } catch (error: any) {
    console.error("SAVED_QUERY_TOGGLE_ERROR:", error);

    return Response.json(
      {
        error: error?.message || "저장 키워드 즐겨찾기 토글 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
