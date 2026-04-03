// app/api/briefings/[id]/favorite/route.ts

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function applyFavoriteTag(categoryTag: string | null, isFavorite: boolean) {
  const raw = String(categoryTag || "").trim();

  if (!raw) {
    return isFavorite ? "FAVORITE_EXECUTIVE" : "EXECUTIVE";
  }

  const parts = raw.split("_").filter(Boolean);
  const withoutFavorite = parts.filter((part) => part !== "FAVORITE");

  if (isFavorite) {
    return ["FAVORITE", ...withoutFavorite].join("_");
  }

  return withoutFavorite.join("_");
}

function isFavoriteTag(categoryTag: string | null) {
  return String(categoryTag || "").split("_").includes("FAVORITE");
}

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
    const favorite = Boolean(body?.favorite);

    const existing = await prisma.briefing.findUnique({
      where: { id: briefingId },
      select: {
        id: true,
        categoryTag: true,
      },
    });

    if (!existing) {
      return Response.json(
        {
          error: "브리핑을 찾을 수 없습니다.",
        },
        { status: 404 }
      );
    }

    const updated = await prisma.briefing.update({
      where: { id: briefingId },
      data: {
        categoryTag: applyFavoriteTag(existing.categoryTag, favorite),
      },
      select: {
        id: true,
        categoryTag: true,
      },
    });

    return Response.json({
      ok: true,
      id: updated.id,
      favorite: isFavoriteTag(updated.categoryTag),
      categoryTag: updated.categoryTag,
    });
  } catch (error: any) {
    console.error("BRIEFING FAVORITE ERROR:", error);

    return Response.json(
      {
        error: error?.message || "브리핑 즐겨찾기 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
