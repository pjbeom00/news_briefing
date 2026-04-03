// (2026-04-01) lib/briefing-runner.ts
// (2026-04-02) 중복 기사 제거 + 구조화된 Gemini 브리핑 + 메일 품질 개선
// (2026-04-03) 브리핑 템플릿 2종 적용 (경영진용 요약형 / 실무자용 상세형)

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

type StructuredBriefing = {
  trend: string;
  keyPoints: string[];
  companyInsight: string;
  comment: string;
};

type BriefingTemplateType = "EXECUTIVE" | "PRACTICAL";

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
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
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

function collectQueryCandidates(rows: Array<{ query: string }>, limit: number) {
  const deduped: string[] = [];

  for (const row of rows) {
    const query = String(row.query || "").trim();
    if (!query) continue;
    if (deduped.includes(query)) continue;
    deduped.push(query);

    if (deduped.length >= limit) break;
  }

  return deduped;
}

function queryMatchScore(news: CandidateNews, queries: string[]) {
  const haystack = normalizeText(
    [news.title, news.snippet, news.sourceQuery].filter(Boolean).join(" ")
  );

  let score = 0;
  for (const query of queries) {
    for (const token of tokenize(query)) {
      if (token.length <= 1) continue;
      if (haystack.includes(token)) score += 2;
    }
  }

  return score;
}

function businessSignalScore(news: CandidateNews) {
  const text = `${news.title} ${news.snippet || ""}`;
  let score = 0;

  if (/투자|수주|실적|매출|제휴|협력|계약|공급|확대|출시|양산|증설/i.test(text)) {
    score += 5;
  }

  if (/\d+%|\d+억|\d+조|\d+만|\d+배/.test(text)) {
    score += 3;
  }

  return score;
}

function freshnessScore(news: CandidateNews) {
  const ageHours = Math.max(
    0,
    (Date.now() - news.createdAt.getTime()) / (1000 * 60 * 60)
  );

  if (ageHours <= 12) return 5;
  if (ageHours <= 24) return 4;
  if (ageHours <= 72) return 3;
  if (ageHours <= 168) return 2;
  return 1;
}

function jaccardSimilarity(a: string, b: string) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (!setA.size || !setB.size) return 0;

  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) intersection += 1;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function isDuplicateTitle(a: string, b: string) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  if (!aa || !bb) return false;
  if (aa === bb) return true;
  if (aa.includes(bb) || bb.includes(aa)) return true;

  return jaccardSimilarity(aa, bb) >= 0.72;
}

function getDomain(link: string) {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function deduplicateAndRankNews(newsList: CandidateNews[], queries: string[]) {
  const firstPass = newsList
    .map((news) => ({
      ...news,
      sourceDomain: getDomain(news.link),
      baseScore:
        queryMatchScore(news, queries) +
        businessSignalScore(news) +
        freshnessScore(news),
    }))
    .sort((a, b) => b.baseScore - a.baseScore || b.id - a.id);

  const uniqueNews: Array<
    CandidateNews & {
      sourceDomain: string;
      baseScore: number;
      diversityPenalty: number;
      finalScore: number;
    }
  > = [];

  const domainCount = new Map<string, number>();

  for (const news of firstPass) {
    const duplicated = uniqueNews.some((existing) =>
      isDuplicateTitle(existing.title, news.title)
    );

    if (duplicated) continue;

    const count = domainCount.get(news.sourceDomain) || 0;
    const diversityPenalty = count >= 2 ? count * 1.4 : 0;
    domainCount.set(news.sourceDomain, count + 1);

    uniqueNews.push({
      ...news,
      diversityPenalty,
      finalScore: news.baseScore - diversityPenalty,
    });
  }

  return uniqueNews.sort((a, b) => b.finalScore - a.finalScore);
}

function buildFallbackStructuredBriefing(input: {
  queries: string[];
  newsList: CandidateNews[];
  templateType: BriefingTemplateType;
}): StructuredBriefing {
  if (input.templateType === "PRACTICAL") {
    return {
      trend: `${input.queries.slice(0, 3).join(", ")} 중심 기사들을 보면 최근 이슈가 반복적으로 수렴되고 있으며, 실무적으로 확인할 운영 영향 포인트가 드러나고 있습니다.`,
      keyPoints: input.newsList.slice(0, 5).map((item) => item.title),
      companyInsight:
        "실무 관점에서는 공급망, 투자, 실적, 생산 확대, 협력 구조 변화가 실제 운영 이슈와 연결되는지 점검하는 것이 중요합니다.",
      comment:
        "중복 기사 제거 후 핵심 기사 기준으로 후속 검토 우선순위를 정하는 방식이 효율적입니다.",
    };
  }

  return {
    trend: `${input.queries.slice(0, 3).join(", ")} 중심으로 최근 기사 흐름을 보면, 주요 이슈가 반복적으로 수렴되며 기업 관점에서 추적할 포인트가 뚜렷해지고 있습니다.`,
    keyPoints: input.newsList.slice(0, 3).map((item) => item.title),
    companyInsight:
      "기업 관점에서는 단순한 기사 수보다 실제 투자, 공급망, 실적, 정책 변화와 연결되는 핵심 기사를 중심으로 판단하는 것이 중요합니다.",
    comment:
      "유사 기사 반복이 많을수록 핵심 기사 선별과 중복 제거의 중요성이 커집니다.",
  };
}

function buildMailSubject(
  queryText: string,
  templateType: BriefingTemplateType,
  isResend = false
) {
  const firstKeyword =
    queryText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)[0] || "뉴스";

  const compactKeyword =
    firstKeyword.length > 24 ? `${firstKeyword.slice(0, 24)}...` : firstKeyword;

  const label = templateType === "PRACTICAL" ? "실무형" : "경영진용";

  return isResend
    ? `[${compactKeyword}] 브리핑 (${label}) [재발송]`
    : `[${compactKeyword}] 브리핑 (${label})`;
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
  templateType: BriefingTemplateType;
}) {
  const topItems = input.items.slice(0, 3);
  const otherItems =
    input.templateType === "PRACTICAL" ? input.items.slice(3) : input.items.slice(3, 6);

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
          ${
            input.templateType === "PRACTICAL"
              ? `
          <div style="font-size:13px;line-height:1.8;color:#475569;margin-top:6px;">
            ${escapeHtml(item.summary)}
          </div>
          `
              : ""
          }
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
            <div style="font-size:12px;color:#93c5fd;margin-top:6px;">
              ${input.templateType === "PRACTICAL" ? "실무자용 상세형" : "경영진용 요약형"}
            </div>
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
          otherItems.length
            ? `
        <tr><td style="height:8px;"></td></tr>

        <tr>
          <td>
            <div style="font-size:18px;font-weight:800;color:#475569;margin-bottom:12px;">
              ${input.templateType === "PRACTICAL" ? "추가 확인 기사" : "그 외 기사"}
            </div>
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

async function summarizePerNews(newsList: CandidateNews[]) {
  const { GEMINI_API_KEY } = getBriefingEnv();

  if (!GEMINI_API_KEY || newsList.length === 0) {
    return newsList.map((item) => ({
      id: item.id,
      summary: item.snippet || item.title,
    }));
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = `
아래 기사별로 한 줄 요약을 만들어라.
반드시 JSON만 반환한다.

형식:
{
  "items": [
    { "id": 1, "summary": "..." }
  ]
}

조건:
- 한국어
- 기사당 1~2문장
- 90자 이내
- 과장 금지

기사 목록:
${newsList
  .map(
    (item) => `
id: ${item.id}
title: ${item.title}
snippet: ${item.snippet || ""}
`
  )
  .join("\n")}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(response.text || "{}") as {
      items?: { id: number; summary: string }[];
    };

    if (!Array.isArray(parsed.items)) {
      return newsList.map((item) => ({
        id: item.id,
        summary: item.snippet || item.title,
      }));
    }

    return parsed.items;
  } catch (error) {
    if (isQuotaError(error)) {
      console.error("NEWS SUMMARY QUOTA FALLBACK:", error);
    } else {
      console.error("NEWS SUMMARY ERROR:", error);
    }

    return newsList.map((item) => ({
      id: item.id,
      summary: item.snippet || item.title,
    }));
  }
}

async function generateStructuredBriefing(input: {
  queries: string[];
  newsList: CandidateNews[];
  summaries: { id: number; summary: string }[];
  templateType: BriefingTemplateType;
}) {
  const { GEMINI_API_KEY } = getBriefingEnv();

  if (!GEMINI_API_KEY || input.newsList.length === 0) {
    return buildFallbackStructuredBriefing(input);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt =
      input.templateType === "PRACTICAL"
        ? `
너는 실무자용 뉴스 브리핑 분석가다.
아래 기사들을 종합해서 구조화된 브리핑을 작성해라.
개별 기사 나열이 아니라 실무 관점 설명이 포함되어야 한다.
반드시 JSON만 반환한다.

형식:
{
  "trend": "오늘의 핵심 동향",
  "keyPoints": ["포인트1", "포인트2", "포인트3"],
  "companyInsight": "기업 관점 요약",
  "comment": "마지막 코멘트"
}

조건:
1. trend는 2~3문장
2. keyPoints는 4~5개
3. keyPoints는 실무 관점에서 좀 더 구체적으로
4. companyInsight는 운영/실행 영향 중심
5. comment는 후속 검토 포인트 중심
6. 중복되는 이슈는 하나의 흐름으로 묶기
7. 과장 금지
8. 한국어

검색어:
${input.queries.join(", ")}

기사 목록:
${input.newsList
  .map((item) => {
    const summary =
      input.summaries.find((row) => row.id === item.id)?.summary ||
      item.snippet ||
      item.title;

    return `
제목: ${item.title}
요약: ${summary}
`;
  })
  .join("\n")}
`
        : `
너는 경영진용 뉴스 브리핑 분석가다.
아래 기사들을 종합해서 구조화된 브리핑을 작성해라.
개별 기사 나열이 아니라 전체 흐름과 시사점을 압축적으로 정리해라.
반드시 JSON만 반환한다.

형식:
{
  "trend": "오늘의 핵심 동향",
  "keyPoints": ["포인트1", "포인트2", "포인트3"],
  "companyInsight": "기업 관점 요약",
  "comment": "마지막 코멘트"
}

조건:
1. trend는 2~3문장
2. keyPoints는 3개
3. companyInsight는 의사결정 포인트 중심
4. comment는 시사점 중심
5. 중복되는 이슈는 하나의 흐름으로 묶기
6. 과장 금지
7. 한국어

검색어:
${input.queries.join(", ")}

기사 목록:
${input.newsList
  .map((item) => {
    const summary =
      input.summaries.find((row) => row.id === item.id)?.summary ||
      item.snippet ||
      item.title;

    return `
제목: ${item.title}
요약: ${summary}
`;
  })
  .join("\n")}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(response.text || "{}") as StructuredBriefing;

    if (!parsed?.trend || !Array.isArray(parsed?.keyPoints)) {
      return buildFallbackStructuredBriefing(input);
    }

    return {
      trend: parsed.trend,
      keyPoints:
        input.templateType === "PRACTICAL"
          ? parsed.keyPoints.slice(0, 5)
          : parsed.keyPoints.slice(0, 3),
      companyInsight: parsed.companyInsight || "",
      comment: parsed.comment || "",
    };
  } catch (error) {
    if (isQuotaError(error)) {
      console.error("STRUCTURED BRIEFING QUOTA FALLBACK:", error);
    } else {
      console.error("STRUCTURED BRIEFING ERROR:", error);
    }

    return buildFallbackStructuredBriefing(input);
  }
}

async function buildBriefingMailPayload(input: {
  queries: string[];
  newsList: CandidateNews[];
  scheduledDateLabel: string;
  templateType: BriefingTemplateType;
}) {
  const summaries = await summarizePerNews(input.newsList);
  const structured = await generateStructuredBriefing({
    queries: input.queries,
    newsList: input.newsList,
    summaries,
    templateType: input.templateType,
  });

  const summaryMap = new Map(summaries.map((row) => [row.id, row.summary]));

  const html = buildMailHtml({
    scheduledDateLabel: input.scheduledDateLabel,
    structured,
    templateType: input.templateType,
    items: input.newsList.map((item, index) => ({
      rank: index + 1,
      title: item.title,
      link: item.link,
      summary: summaryMap.get(item.id) || item.snippet || item.title,
      sourceQuery: item.sourceQuery,
      createdAt: item.createdAt,
    })),
  });

  return {
    overallSummary: [
      `오늘의 핵심 동향: ${structured.trend}`,
      `핵심 포인트:`,
      ...structured.keyPoints.map((point) => `- ${point}`),
      `기업 관점: ${structured.companyInsight}`,
      `마지막 코멘트: ${structured.comment}`,
    ].join("\n"),
    structured,
    html,
  };
}

export async function runDailyBriefing(): Promise<RunDailyBriefingResult> {
  const { BRIEFING_TO_EMAIL, BRIEFING_MAX_NEWS, BRIEFING_MAX_QUERIES } =
    getBriefingEnv();

  const templateType: BriefingTemplateType = "EXECUTIVE";
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
    take: 180,
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

  const rankedUniqueNews = deduplicateAndRankNews(recentNews, queryCandidates);
  const finalNews = rankedUniqueNews.slice(0, BRIEFING_MAX_NEWS);

  if (!finalNews.length) {
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

  const briefingQueryText = queryCandidates.join(", ");
  const { overallSummary, html } = await buildBriefingMailPayload({
    queries: queryCandidates,
    newsList: finalNews,
    scheduledDateLabel,
    templateType,
  });

  const briefing = existing
    ? await prisma.briefing.update({
        where: { id: existing.id },
        data: {
          query: briefingQueryText,
          summary: overallSummary,
          categoryTag: `DAILY_AUTO_${templateType}`,
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
          categoryTag: `DAILY_AUTO_${templateType}`,
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
      subject: buildMailSubject(briefingQueryText, templateType, false),
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

export async function resendBriefing(
  briefingId: number
): Promise<ResendBriefingResult> {
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

  const templateType: BriefingTemplateType =
    briefing.categoryTag?.includes("PRACTICAL") ? "PRACTICAL" : "EXECUTIVE";

  const scheduledDateLabel = getKstDayKey(
    briefing.scheduledDate || briefing.createdAt
  );

  const { overallSummary, html } = await buildBriefingMailPayload({
    queries: queryCandidates,
    newsList,
    scheduledDateLabel,
    templateType,
  });

  try {
    await sendMail({
      to: BRIEFING_TO_EMAIL,
      subject: buildMailSubject(briefing.query, templateType, true),
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
