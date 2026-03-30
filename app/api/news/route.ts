// app/api/news/route.ts

import { prisma } from "@/lib/prisma";

export async function GET() {
  const news = await prisma.news.findMany({
    orderBy: {
      id: "desc",
    },
    take: 30,
  });

  return Response.json({
    count: news.length,
    data: news,
  });
}

