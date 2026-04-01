// (2026-04-01) lib/briefing-runner.ts

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/gmail";
import { getBriefingEnv } from "@/lib/env";

type CandidateNews = {
  id: number;
  title: string;
  link: string;
  snippet: string | null;
  summary: string | null;
  sourceQuery: string | null;
  createdAt: Date;
};

type SummaryItem = {
  id: number;
  summary: string;
};

type RunDailyBriefingResult = {
  ok: boolean;
  status: "SENT" | "SKIPPED" | "FAILED";
  briefingId?: number;
  reason?: string;
  sentTo?: string;
  queryCount?: number;
  newsCount?: number;
};

function normalizeText(value: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[|,/()\-_[\]]+/g, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 429
  ) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string"
  ) {
    const message = (error as { message: string }).message;

    return (
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("Quota exceeded") ||
      message.includes('"code":429')
    );
  }

  return false;
}

function getKstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getKstDayKey(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getKstStartOfDay(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth();
  const day = kst.getUTCDate();

  return new Date(Date.UTC(year, month, day, 0, 0, 0) - 9 * 60 * 60 * 1000);
}

function getRecentWindowStart(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function buildFallbackSummary(news: CandidateNews) {
  const base = news.snippet?.trim() || news.title.trim();

  if (base.length <= 140) {
    return base;
  }

  return `${base.slice(0, 137)}...`;
}

function collectQueryCandidates(rows: Array<{ query: string }>, limit: number) {
  const deduped: string[] = [];

  for (const row of rows) {
    const query = String(row.query || "").trim();
    if (!query) continue;
    if (deduped.includes(query)) continue;

    deduped.push(query);

    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

function scoreNews(news: CandidateNews, queries: string[]) {
  const haystack = normalizeText(
    [news.title, news.snippet, news.sourceQuery].filter(Boolean).join(" ")
  );

  let score = 0;

  for (const query of queries) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) continue;

    if (haystack.includes(normalizedQuery)) {
      score += 10;
    }

    for (const token of tokenize(query)) {
      if (token.length <= 1) continue;
      if (haystack.includes(token)) {
        score += 2;
      }
    }
  }

  const recentBoost = Math.max(
    0,
    5 - Math.floor((Date.now() - news.createdAt.getTime()) / (1000 * 60 * 60 * 6))
  );

  score += recentBoost;

  if (news.summary) {
    score += 1;
  }

  return score;
}

function buildMailHtml(input: {
  scheduledDateLabel: string;
  querySummary: string;
  overallSummary: string;
  items: Array<{
    rank: number;
    title: string;
    link: string;
    summary: string;
    sourceQuery: string | null;
  }>;
}) {
  const itemsHtml = input.items
    .map(
      (item) => `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">TOP ${item.rank}${item.sourceQuery ? ` · ${escapeHtml(item.sourceQuery)}` : ""}</div>
            <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:8px;">
              <a href="${escapeHtml(item.link)}" target="_blank" style="color:#111827;text-decoration:none;">
                ${escapeHtml(item.title)}
              </a>
            </div>
            <div style="font-size:14px;line-height:1.7;color:#374151;">
              ${escapeHtml(item.summary)}
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="background:#f9fafb;padding:24px;font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
        <tr>
          <td>
            <div style="font-size:24px;font-weight:800;color:#111827;margin-bottom:8px;">매일 아침 뉴스 브리핑</div>
            <div style="font-size:13px;color:#6b7280;margin-bottom:20px;">${escapeHtml(input.scheduledDateLabel)} 기준 자동 생성</div>

            <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin-bottom:20px;">
              <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">주요 관심 검색어</div>
              <div style="font-size:15px;font-weight:600;color:#111827;">${escapeHtml(input.querySummary)}</div>
            </div>

            <div style="background:#eff6ff;border-radius:10px;padding:16px;margin-bottom:24px;">
              <div style="font-size:13px;color:#2563eb;margin-bottom:6px;">오늘의 한줄 요약</div>
              <div style="font-size:15px;line-height:1.7;color:#1f2937;">${escapeHtml(input.overallSummary)}</div>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0">
              ${itemsHtml}
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function summarizeNewsBatch(newsList: CandidateNews[]) {
  const { GEMINI_API_KEY } = getBriefingEnv();

  if (!GEMINI_API_KEY || newsList.length === 0) {
    return new Map<number, string>();
  }

  const targets = newsList.filter((item) => !item.summary);

  if (targets.length === 0) {
    return new Map<number, string>();
  }

  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
  });

  const prompt = `
너는 뉴스 브리핑 요약기다.
아래 기사 목록을 보고 각 기사마다 2문장 이내의 한국어 요약을 작성해라.
출력은 반드시 JSON만 반환한다.

조건:
1. 과장하지 마라.
2. 각 summary는 90자 이내로 작성한다.
3. 기사마다 id를 그대로 유지한다.
4. JSON 형식:
{
  "items": [
    { "id": 1, "summary": "..." }
  ]
}

[기사 목록]
${targets
  .map(
    (item) => `
- id: ${item.id}
  title: ${item.title}
  snippet: ${item.snippet || ""}
  sourceQuery: ${item.sourceQuery || ""}
`
  )
  .join("\n")}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  summary: { type: "string" },
                },
                required: ["id", "summary"],
              },
            },
          },
          required: ["items"],
        },
      },
    });

    const parsed = safeJsonParse<{ items: SummaryItem[] }>(response.text || "");

    if (!parsed || !Array.isArray(parsed.items)) {
      return new Map<number, string>();
    }

    const summaryMap = new Map<number, string>();

    for (const item of parsed.items) {
      const summary = String(item.summary || "").trim();
      if (!item.id || !summary) continue;
      summaryMap.set(item.id, summary);
    }

    return summaryMap;
  } catch (error) {
    if (isQuotaError(error)) {
      console.error("BRIEFING SUMMARY QUOTA FALLBACK:", error);
      return new Map<number, string>();
    }

    console.error("BRIEFING SUMMARY ERROR:", error);
    return new Map<number, string>();
  }
}

async function updateNewsSummaries(summaryMap: Map<number, string>) {
  const entries = [...summaryMap.entries()];

  for (const [id, summary] of entries) {
    await prisma.news.update({
      where: { id },
      data: { summary },
    });
  }
}

export async function runDailyBriefing(): Promise<RunDailyBriefingResult> {
  const { BRIEFING_TO_EMAIL, BRIEFING_MAX_NEWS, BRIEFING_MAX_QUERIES } = getBriefingEnv();

  const scheduledDate = getKstStartOfDay();
  const scheduledDateLabel = getKstDayKey();
  const existing = await prisma.briefing.findUnique({
    where: { scheduledDate },
  });

  if (existing?.status === "SENT") {
    return {
      ok: true,
      status: "SKIPPED",
      briefingId: existing.id,
      reason: `${scheduledDateLabel} 브리핑은 이미 발송되었습니다.`,
      sentTo: existing.sentTo || undefined,
    };
  }

  const savedQueries = await prisma.savedQuery.findMany({
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: {
      query: true,
    },
  });

  const fallbackBriefings = await prisma.briefing.findMany({
    where: {
      query: {
        not: "",
      },
    },
    orderBy: { id: "desc" },
    take: 10,
    select: {
      query: true,
    },
  });

  const queryCandidates = collectQueryCandidates(
    [...savedQueries, ...fallbackBriefings],
    BRIEFING_MAX_QUERIES
  );

  if (queryCandidates.length === 0) {
    const briefing = existing
      ? await prisma.briefing.update({
          where: { id: existing.id },
          data: {
            query: "자동 브리핑",
            summary: "저장된 검색어가 없어 브리핑을 생성하지 못했습니다.",
            status: "FAILED",
            errorMessage: "저장된 검색어가 없습니다.",
            scheduledDate,
          },
        })
      : await prisma.briefing.create({
          data: {
            query: "자동 브리핑",
            summary: "저장된 검색어가 없어 브리핑을 생성하지 못했습니다.",
            status: "FAILED",
            errorMessage: "저장된 검색어가 없습니다.",
            scheduledDate,
          },
        });

    return {
      ok: false,
      status: "FAILED",
      briefingId: briefing.id,
      reason: "저장된 검색어가 없습니다.",
    };
  }

  const recentNews = await prisma.news.findMany({
    where: {
      createdAt: {
        gte: getRecentWindowStart(72),
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 120,
    select: {
      id: true,
      title: true,
      link: true,
      snippet: true,
      summary: true,
      sourceQuery: true,
      createdAt: true,
    },
  });

  const scoredNews = recentNews
    .map((item) => ({
      ...item,
      score: scoreNews(item, queryCandidates),
    }))
    .sort((a, b) => b.score - a.score || b.id - a.id);

  const selectedNews = scoredNews
    .filter((item) => item.score > 0)
    .slice(0, BRIEFING_MAX_NEWS)
    .map(({ score, ...rest }) => rest);

  const finalNews =
    selectedNews.length > 0
      ? selectedNews
      : recentNews.slice(0, BRIEFING_MAX_NEWS);

  if (finalNews.length === 0) {
    const briefing = existing
      ? await prisma.briefing.update({
          where: { id: existing.id },
          data: {
            query: queryCandidates.join(", "),
            summary: "대상 기사가 없어 브리핑을 생성하지 못했습니다.",
            status: "FAILED",
            errorMessage: "최근 기사 데이터가 없습니다.",
            scheduledDate,
          },
        })
      : await prisma.briefing.create({
          data: {
            query: queryCandidates.join(", "),
            summary: "대상 기사가 없어 브리핑을 생성하지 못했습니다.",
            status: "FAILED",
            errorMessage: "최근 기사 데이터가 없습니다.",
            scheduledDate,
          },
        });

    return {
      ok: false,
      status: "FAILED",
      briefingId: briefing.id,
      reason: "최근 기사 데이터가 없습니다.",
      queryCount: queryCandidates.length,
    };
  }

  const pendingSummaryMap = await summarizeNewsBatch(finalNews);

  if (pendingSummaryMap.size > 0) {
    await updateNewsSummaries(pendingSummaryMap);
  }

  const summaryMap = new Map<number, string>();

  for (const item of finalNews) {
    summaryMap.set(
      item.id,
      pendingSummaryMap.get(item.id) || item.summary || buildFallbackSummary(item)
    );
  }

  const overallSummary = `${queryCandidates.slice(0, 3).join(", ")} 중심으로 주요 기사 ${finalNews.length}건을 정리했습니다.`;

  const briefing = existing
    ? await prisma.briefing.update({
        where: { id: existing.id },
        data: {
          query: queryCandidates.join(", "),
          summary: overallSummary,
          categoryTag: "DAILY_AUTO",
          sentTo: BRIEFING_TO_EMAIL,
          status: "PENDING",
          errorMessage: null,
          scheduledDate,
        },
      })
    : await prisma.briefing.create({
        data: {
          query: queryCandidates.join(", "),
          summary: overallSummary,
          categoryTag: "DAILY_AUTO",
          sentTo: BRIEFING_TO_EMAIL,
          status: "PENDING",
          scheduledDate,
        },
      });

  await prisma.briefingItem.deleteMany({
    where: {
      briefingId: briefing.id,
    },
  });

  await prisma.briefingItem.createMany({
    data: finalNews.map((item, index) => ({
      briefingId: briefing.id,
      newsId: item.id,
      rankOrder: index + 1,
    })),
  });

  const html = buildMailHtml({
    scheduledDateLabel,
    querySummary: queryCandidates.join(", "),
    overallSummary,
    items: finalNews.map((item, index) => ({
      rank: index + 1,
      title: item.title,
      link: item.link,
      summary: summaryMap.get(item.id) || buildFallbackSummary(item),
      sourceQuery: item.sourceQuery,
    })),
  });

  try {
    await sendMail({
      to: BRIEFING_TO_EMAIL,
      subject: `[뉴스 브리핑] ${scheduledDateLabel} 아침 브리핑`,
      html,
    });

    await prisma.briefing.update({
      where: { id: briefing.id },
      data: {
        sentAt: getKstNow(),
        status: "SENT",
        errorMessage: null,
      },
    });

    return {
      ok: true,
      status: "SENT",
      briefingId: briefing.id,
      sentTo: BRIEFING_TO_EMAIL,
      queryCount: queryCandidates.length,
      newsCount: finalNews.length,
    };
  } catch (error: any) {
    console.error("DAILY BRIEFING SEND ERROR:", error);

    await prisma.briefing.update({
      where: { id: briefing.id },
      data: {
        status: "FAILED",
        errorMessage: error?.message || "메일 발송 실패",
      },
    });

    return {
      ok: false,
      status: "FAILED",
      briefingId: briefing.id,
      sentTo: BRIEFING_TO_EMAIL,
      reason: error?.message || "메일 발송 실패",
      queryCount: queryCandidates.length,
      newsCount: finalNews.length,
    };
  }
}
