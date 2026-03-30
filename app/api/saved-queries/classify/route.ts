// app/api/saved-queries/classify/route.ts

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

export async function POST() {
  try {
    const targets = await prisma.savedQuery.findMany({
      where: {
        OR: [
          { category: null },
          { category: "" },
          { category: "미분류" },
        ],
      },
      orderBy: {
        id: "desc",
      },
    });

    const results = await Promise.all(
      targets.map((item) =>
        prisma.savedQuery.update({
          where: { id: item.id },
          data: {
            category: detectCategoryFromQuery(item.query),
          },
        })
      )
    );

    return Response.json({
      count: results.length,
      data: results,
    });
  } catch (error: any) {
    console.error("SAVED QUERY CLASSIFY ERROR:", error);

    return Response.json(
      { error: error?.message || "미분류 자동 분류 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
