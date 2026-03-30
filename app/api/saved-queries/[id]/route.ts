// app/api/saved-queries/[id]/route.ts

import { prisma } from "@/lib/prisma";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  반도체: [
    "hbm",
    "hbf",
    "dram",
    "nand",
    "d램",
    "낸드",
    "반도체",
    "파운드리",
    "micron",
    "마이크론",
    "삼성전자",
    "sk hynix",
    "sk하이닉스",
    "하이닉스",
    "tsmc",
    "패키징",
  ],
  AI: [
    "ai",
    "인공지능",
    "llm",
    "gpt",
    "chatgpt",
    "openai",
    "gemini",
    "claude",
    "anthropic",
    "copilot",
    "rag",
    "prompt",
  ],
  메모리: [
    "memory",
    "메모리",
    "ssd",
    "ram",
    "dram",
    "nand",
    "hbm",
    "hbf",
  ],
  클라우드: [
    "cloud",
    "클라우드",
    "aws",
    "azure",
    "gcp",
    "kubernetes",
    "k8s",
    "docker",
    "serverless",
    "terraform",
    "devops",
  ],
  금융: [
    "금융",
    "은행",
    "보험",
    "증권",
    "주식",
    "채권",
    "금리",
    "환율",
    "fomc",
    "fed",
    "etf",
    "코스피",
    "나스닥",
  ],
  물류: [
    "물류",
    "택배",
    "배송",
    "풀필먼트",
    "wms",
    "tms",
    "oms",
    "warehouse",
    "창고",
    "last mile",
    "라스트마일",
    "운송",
    "운임",
  ],
};

function normalizeQuery(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function detectCategoryFromQuery(query: string) {
  const normalized = normalizeQuery(query);

  let bestCategory = "기타";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;

    for (const keyword of keywords) {
      const normalizedKeyword = normalizeQuery(keyword);
      if (normalized.includes(normalizedKeyword)) {
        score += normalizedKeyword.length >= 4 ? 3 : 2;
      }
    }

    if (score > bestScore) {
      bestCategory = category;
      bestScore = score;
    }
  }

  return bestCategory;
}

function resolveCategory(inputCategory: unknown, query: string) {
  const category = String(inputCategory || "").trim();

  if (!category || category === "전체" || category === "미분류") {
    return detectCategoryFromQuery(query);
  }

  return category;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.savedQuery.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) {
      return Response.json(
        { error: "저장 키워드를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const nextQuery =
      body.query !== undefined ? String(body.query).trim() : existing.query;

    const nextCategory =
      body.category !== undefined
        ? resolveCategory(body.category, nextQuery)
        : body.query !== undefined
        ? resolveCategory(existing.category, nextQuery)
        : existing.category;

    const updated = await prisma.savedQuery.update({
      where: {
        id: Number(id),
      },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.query !== undefined ? { query: nextQuery } : {}),
        ...(body.category !== undefined || body.query !== undefined
          ? { category: nextCategory }
          : {}),
        ...(body.isFavorite !== undefined
          ? { isFavorite: Boolean(body.isFavorite) }
          : {}),
      },
    });

    return Response.json(updated);
  } catch (error: any) {
    console.error("SAVED QUERY PATCH ERROR:", error);

    return Response.json(
      { error: error?.message || "저장 키워드 수정 중 오류가 발생했습니다." },
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

    await prisma.savedQuery.delete({
      where: {
        id: Number(id),
      },
    });

    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("SAVED QUERY DELETE ERROR:", error);

    return Response.json(
      { error: error?.message || "저장 키워드 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
