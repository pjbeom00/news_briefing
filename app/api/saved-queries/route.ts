// app/api/saved-queries/route.ts

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const favorite = searchParams.get("favorite");

    const where: {
      category?: string;
      isFavorite?: boolean;
    } = {};

    if (category && category !== "전체") {
      where.category = category;
    }

    if (favorite === "true") {
      where.isFavorite = true;
    }

    const items = await prisma.savedQuery.findMany({
      where,
      orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
    });

    return Response.json({
      count: items.length,
      data: items,
    });
  } catch (error: any) {
    console.error("SAVED QUERIES GET ERROR:", error);

    return Response.json(
      { error: error?.message || "저장 키워드 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { name, query, category } = await req.json();

    const trimmedName = String(name || "").trim();
    const trimmedQuery = String(query || "").trim();

    // 저장 이름만 넣고 저장해도 검색어로 사용 가능하게 처리
    const effectiveQuery = trimmedQuery || trimmedName;
    const effectiveName = trimmedName || effectiveQuery;

    if (!effectiveName) {
      return Response.json(
        { error: "키워드 이름이 비어 있습니다." },
        { status: 400 }
      );
    }

    if (!effectiveQuery) {
      return Response.json(
        { error: "검색어가 비어 있습니다." },
        { status: 400 }
      );
    }

    const resolvedCategory = resolveCategory(category, effectiveQuery);

    const item = await prisma.savedQuery.create({
      data: {
        name: effectiveName,
        query: effectiveQuery,
        category: resolvedCategory,
      },
    });

    return Response.json(item);
  } catch (error: any) {
    console.error("SAVED QUERIES POST ERROR:", error);

    return Response.json(
      { error: error?.message || "저장 키워드 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
