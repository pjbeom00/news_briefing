// (2026-04-01) lib/briefing-runner.ts
// (2026-04-02) 중복 기사 제거 + 구조화된 Gemini 브리핑 + 메일 품질 개선

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

type StructuredBriefing = {
  trend: string;
  keyPoints: string[];
  companyInsight: string;
  comment: string;
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

type ResendBriefingResult = {
  ok: boolean;
  status: "SENT" | "FAILED";
  briefingId: number;
  sentTo?: string;
  reason?: string;
  newsCount?: number;
};

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .replace(/[|,/()\-_[\]:"'`~!?]+/g, " ")
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

  return `${year}.${month}.${day}`;
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

  if (base.length <= 120) {
    return base;
  }

  return `${base.slice(0, 117)}...`;
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
      score += 12;
    }

    for (const token of tokenize(query)) {
      if (token.length <= 1) continue;
      if (haystack.includes(token)) {
        score += 2;
      }
    }
  }

  if (/투자|계약|확대|수주|진출|협력|제재|공급|실적|매출|생산/i.test(news.title)) {
    score += 5;
  }

  if (/\d+%|\d+억|\d+조|\d+만|\d+배/.test(news.title)) {
    score += 3;
  }

  const recentBoost = Math.max(
    0,
    5 - Math.floor((Date.now() - news.createdAt.getTime()) / (1000 * 60 * 60 * 6))
  );

  score += recentBoost;

  return score;
}

function isSimilarTitle(a: string, b: string) {
  const aa = normalizeText(a).replace(/[^\p{L}\p{N}\s]/gu, "");
  const bb = normalizeText(b).replace(/[^\p{L}\p{N}\s]/gu, "");

  if (!aa || !bb) return false;
  if (aa === bb) return true;
  if (aa.includes(bb) || bb.includes(aa)) return true;

  const tokensA = tokenize(aa);
  const tokensB = tokenize(bb);

  if (!tokensA.length || !tokensB.length) return false;

  const overlap = tokensA.filter((token) => tokensB.includes(token)).length;
  const minLength = Math.min(tokensA.length, tokensB.length);

  return overlap >= Math.ceil(minLength * 0.6);
}

function deduplicateNews(newsList: CandidateNews[]) {
  const result: CandidateNews[] = [];

  for (const news of newsList) {
    const isDuplicate = result.some((existing) =>
      isSimilarTitle(existing.title, news.title)
    );

    if (!isDuplicate) {
      result.push(news);
    }
  }

  return result;
}

function buildFallbackStructuredBriefing(input: {
  queries: string[];
  newsList: CandidateNews[];
  summaryMap: Map<number, string>;
}): StructuredBriefing {
  const topNews = input.newsList.slice(0, 3);
  const querySummary = input.queries.slice(0, 3).join(", ") || "주요 관심 키워드";
  const keyPoints = topNews.map((item) => {
    const summary = input.summaryMap.get(item.id) || buildFallbackSummary(item);
    return summary;
  });

  return {
    trend: `${querySummary} 중심으로 최근 기사 흐름을 보면 주요 기업 활동과 시장 변화가 함께 부각되고 있습니다.`,
    keyPoints:
      keyPoints.length > 0
        ? keyPoints.slice(0, 3)
        : ["주요 기사를 바탕으로 핵심 흐름을 정리했습니다."],
    companyInsight:
      "기업 관점에서는 투자, 생산, 공급망, 사업 확장과 관련된 변화가 실제 사업 운영과 전략에 영향을 줄 수 있습니다.",
    comment:
      "중복 이슈를 제외하고 실질적인 사업 변화나 수치가 포함된 뉴스를 우선적으로 추적하는 것이 좋습니다.",
  };
}

function buildBriefingSubject(queryText: string, isResend = false) {
  const firstKeyword =
    queryText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)[0] || "뉴스";

  const compactKeyword =
    firstKeyword.length > 24 ? `${firstKeyword.slice(0, 24)}...` : firstKeyword;

  return isResend
    ? `[${compactKeyword}] 브리핑 [재발송]`
    : `[${compactKeyword}] 브리핑`;
}

function buildMailHtml(input: {
  scheduledDateLabel: string;
  structured: StructuredBriefing;
  items: Array<{
    rank: number;
    title: string;
    link: string;
    summary: string;
    sourceQuery: string | null;
    createdAt: Date;
  }>;
}) {
  const topItems = input.items.slice(0, 3);
  const otherItems = input.items.slice(3);

  const keyPointsHtml = input.structured.keyPoints
    .map(
      (point) => `
        <li style="margin-bottom:10px;line-height:1.8;color:#1f2937;">
          ${escapeHtml(point)}
        </li>
      `
    )
    .join("");

  const topItemsHtml = topItems
    .map(
      (item) => `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:18px;margin-bottom:14px;">
          <div style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px;margin-bottom:10px;">
            TOP ${item.rank}
          </div>
          <div style="font-size:17px;font-weight:800;color:#111827;line-height:1.6;margin-bottom:8px;">
            <a href="${escapeHtml(item.link)}" target="_blank" style="color:#111827;text-decoration:none;">
              ${escapeHtml(item.title)}
            </a>
          </div>
          <div style="font-size:12px;color:#64748b;margin-bottom:8px;line-height:1.7;">
            ${item.createdAt.toUTCString()}${item.sourceQuery ? ` · ${escapeHtml(item.sourceQuery)}` : ""}
          </div>
          <div style="font-size:14px;line-height:1.9;color:#334155;">
            ${escapeHtml(item.summary)}
          </div>
        </div>
      `
    )
    .join("");

  const otherItemsHtml = otherItems
    .map(
      (item) => `
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin-bottom:10px;">
          <div style="font-size:13px;color:#64748b;font-weight:700;margin-bottom:6px;">기사 ${item.rank}</div>
          <div style="font-size:14px;font-weight:700;line-height:1.6;color:#111827;">
            <a href="${escapeHtml(item.link)}" target="_blank" style="color:#111827;text-decoration:none;">
              ${escapeHtml(item.title)}
            </a>
          </div>
        </div>
      `
    )
    .join("");

  return `
    <div style="background:#f3f4f6;padding:24px;font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;margin:0 auto;">
        <tr>
          <td style="background:#0f172a;border-radius:18px;padding:26px 24px 22px 24px;">
            <div style="font-size:28px;font-weight:800;color:#ffffff;margin-bottom:8px;">브리핑</div>
            <div style="font-size:12px;color:#cbd5e1;">${escapeHtml(input.scheduledDateLabel)} 오전 브리핑</div>
          </td>
        </tr>

        <tr><td style="height:16px;"></td></tr>

        <tr>
          <td style="background:#e0f2fe;border:1px solid #7dd3fc;border-radius:16px;padding:18px 20px;">
            <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:12px;">오늘의 핵심 동향</div>
            <div style="font-size:15px;line-height:1.9;color:#1f2937;">
              ${escapeHtml(input.structured.trend)}
            </div>
          </td>
        </tr>

        <tr><td style="height:14px;"></td></tr>

        <tr>
          <td style="background:#ffffff;border:1px solid #dbeafe;border-radius:16px;padding:18px 20px;">
            <div style="font-size:16px;font-weight:800;color:#2563eb;margin-bottom:12px;">핵심 포인트</div>
            <ul style="padding-left:20px;margin:0;">
              ${keyPointsHtml}
            </ul>
          </td>
        </tr>

        <tr><td style="height:14px;"></td></tr>

        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" valign="top" style="padding-right:7px;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;height:100%;">
                    <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:12px;">기업 관점</div>
                    <div style="font-size:14px;line-height:1.9;color:#334155;">
                      ${escapeHtml(input.structured.companyInsight)}
                    </div>
                  </div>
                </td>
                <td width="50%" valign="top" style="padding-left:7px;">
                  <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:16px;padding:18px 20px;height:100%;">
                    <div style="font-size:16px;font-weight:800;color:#9a3412;margin-bottom:12px;">마지막 코멘트</div>
                    <div style="font-size:14px;line-height:1.9;color:#7c2d12;">
                      ${escapeHtml(input.structured.comment)}
                    </div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td style="height:20px;"></td></tr>

        <tr>
          <td>
            <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:14px;">상위 3개 핵심 기사</div>
            ${topItemsHtml}
          </td>
        </tr>

        ${
          otherItems.length > 0
            ? `
        <tr><td style="height:8px;"></td></tr>

        <tr>
          <td>
            <div style="font-size:18px;font-weight:800;color:#475569;margin-bottom:12px;">그 외 기사</div>
            ${otherItemsHtml}
          </td>
        </tr>
        `
            : ""
        }
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
너는 뉴스 기사 요약기다.
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

async function generateStructuredBriefing(input: {
  queries: string[];
  newsList: CandidateNews[];
  summaryMap: Map<number, string>;
}) {
  const { GEMINI_API_KEY } = getBriefingEnv();

  if (!GEMINI_API_KEY || input.newsList.length === 0) {
    return buildFallbackStructuredBriefing(input);
  }

  const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
  });

  const prompt = `
너는 기업용 뉴스 브리핑 분석가다.
아래 기사들을 종합해서 하나의 구조화된 브리핑을 작성해라.
개별 기사 요약을 단순 나열하지 말고, 전체 흐름을 분석해서 작성해라.
출력은 반드시 JSON만 반환한다.

형식:
{
  "trend": "오늘의 핵심 동향",
  "keyPoints": ["핵심 포인트1", "핵심 포인트2", "핵심 포인트3"],
  "companyInsight": "기업 관점 요약",
  "comment": "마지막 코멘트"
}

조건:
1. trend는 2~3문장
2. keyPoints는 3개
3. companyInsight는 실무자 관점
4. comment는 전략적 시사점
5. 반복되는 기사들은 하나의 흐름으로 묶어라
6. 과장 금지
7. 한국어로 작성

[참고 검색어]
${input.queries.join(", ")}

[기사 목록]
${input.newsList
  .map((item) => {
    const summary = input.summaryMap.get(item.id) || buildFallbackSummary(item);
    return `
- title: ${item.title}
  summary: ${summary}
  sourceQuery: ${item.sourceQuery || ""}
`;
  })
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
            trend: { type: "string" },
            keyPoints: {
              type: "array",
              items: { type: "string" },
            },
            companyInsight: { type: "string" },
            comment: { type: "string" },
          },
          required: ["trend", "keyPoints", "companyInsight", "comment"],
        },
      },
    });

    const parsed = safeJsonParse<StructuredBriefing>(response.text || "");

    if (
      !parsed ||
      !parsed.trend ||
      !Array.isArray(parsed.keyPoints) ||
      !parsed.companyInsight ||
      !parsed.comment
    ) {
      return buildFallbackStructuredBriefing(input);
    }

    return {
      trend: String(parsed.trend || "").trim(),
      keyPoints: parsed.keyPoints
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 3),
      companyInsight: String(parsed.companyInsight || "").trim(),
      comment: String(parsed.comment || "").trim(),
    };
  } catch (error) {
    if (isQuotaError(error)) {
      console.error("STRUCTURED BRIEFING QUOTA FALLBACK:", error);
      return buildFallbackStructuredBriefing(input);
    }

    console.error("STRUCTURED BRIEFING ERROR:", error);
    return buildFallbackStructuredBriefing(input);
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

async function buildBriefingMailPayload(input: {
  queries: string[];
  newsList: CandidateNews[];
  scheduledDateLabel: string;
}) {
  const pendingSummaryMap = await summarizeNewsBatch(input.newsList);

  if (pendingSummaryMap.size > 0) {
    await updateNewsSummaries(pendingSummaryMap);
  }

  const summaryMap = new Map<number, string>();

  for (const item of input.newsList) {
    summaryMap.set(
      item.id,
      pendingSummaryMap.get(item.id) || item.summary || buildFallbackSummary(item)
    );
  }

  const structuredBriefing = await generateStructuredBriefing({
    queries: input.queries,
    newsList: input.newsList,
    summaryMap,
  });

  const html = buildMailHtml({
    scheduledDateLabel: input.scheduledDateLabel,
    structured: structuredBriefing,
    items: input.newsList.map((item, index) => ({
      rank: index + 1,
      title: item.title,
      link: item.link,
      summary: summaryMap.get(item.id) || buildFallbackSummary(item),
      sourceQuery: item.sourceQuery,
      createdAt: item.createdAt,
    })),
  });

  return {
    overallSummary: structuredBriefing.trend,
    structuredBriefing,
    html,
  };
}

export async function runDailyBriefing(): Promise<RunDailyBriefingResult> {
  const { BRIEFING_TO_EMAIL, BRIEFING_MAX_NEWS, BRIEFING_MAX_QUERIES } =
    getBriefingEnv();

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
    take: 150,
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

  const filteredNews = scoredNews
    .filter((item) => item.score > 0)
    .map(({ score, ...rest }) => rest);

  const deduplicatedNews = deduplicateNews(filteredNews);
  const finalNews =
    deduplicatedNews.length > 0
      ? deduplicatedNews.slice(0, BRIEFING_MAX_NEWS)
      : deduplicateNews(recentNews).slice(0, BRIEFING_MAX_NEWS);

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

  const { overallSummary, html } = await buildBriefingMailPayload({
    queries: queryCandidates,
    newsList: finalNews,
    scheduledDateLabel,
  });

  const briefingQueryText = queryCandidates.join(", ");

  const briefing = existing
    ? await prisma.briefing.update({
        where: { id: existing.id },
        data: {
          query: briefingQueryText,
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
          query: briefingQueryText,
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

  try {
    await sendMail({
      to: BRIEFING_TO_EMAIL,
      subject: buildBriefingSubject(briefingQueryText, false),
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

export async function resendBriefing(briefingId: number): Promise<ResendBriefingResult> {
  const { BRIEFING_TO_EMAIL } = getBriefingEnv();

  const briefing = await prisma.briefing.findUnique({
    where: { id: briefingId },
    include: {
      items: {
        orderBy: { rankOrder: "asc" },
        include: {
          news: true,
        },
      },
    },
  });

  if (!briefing) {
    return {
      ok: false,
      status: "FAILED",
      briefingId,
      reason: "브리핑을 찾을 수 없습니다.",
    };
  }

  const newsList: CandidateNews[] = briefing.items.map((item) => ({
    id: item.news.id,
    title: item.news.title,
    link: item.news.link,
    snippet: item.news.snippet,
    summary: item.news.summary,
    sourceQuery: item.news.sourceQuery,
    createdAt: item.news.createdAt,
  }));

  if (newsList.length === 0) {
    return {
      ok: false,
      status: "FAILED",
      briefingId,
      reason: "재발송할 기사 목록이 없습니다.",
    };
  }

  const queryCandidates = briefing.query
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const scheduledDateLabel = getKstDayKey(briefing.scheduledDate || briefing.createdAt);

  const { overallSummary, html } = await buildBriefingMailPayload({
    queries: queryCandidates,
    newsList,
    scheduledDateLabel,
  });

  try {
    await sendMail({
      to: BRIEFING_TO_EMAIL,
      subject: buildBriefingSubject(briefing.query, true),
      html,
    });

    await prisma.briefing.update({
      where: { id: briefing.id },
      data: {
        summary: overallSummary,
        sentTo: BRIEFING_TO_EMAIL,
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
      newsCount: newsList.length,
    };
  } catch (error: any) {
    console.error("BRIEFING RESEND ERROR:", error);

    await prisma.briefing.update({
      where: { id: briefing.id },
      data: {
        status: "FAILED",
        errorMessage: error?.message || "재발송 실패",
      },
    });

    return {
      ok: false,
      status: "FAILED",
      briefingId: briefing.id,
      sentTo: BRIEFING_TO_EMAIL,
      reason: error?.message || "재발송 실패",
      newsCount: newsList.length,
    };
  }
}
