// app/api/seed/route.ts

import { prisma } from "@/lib/prisma";

export async function GET() {
  await prisma.news.create({
    data: {
      title: "테스트 뉴스",
      link: `https://example.com/${Date.now()}`,
      snippet: "테스트입니다",
      pubDate: new Date().toISOString(),
      sourceQuery: "테스트",
    },
  });

  return Response.json({ success: true });
}
