// lib/auto-briefing.ts

type SearchItem = {
  title: string;
  link: string;
  snippet: string;
  pubDate: string;
  sourceDomain?: string;
  keywordScore?: number;
  tfidfScore?: number;
  freshnessScore?: number;
  importanceScore?: number;
  diversityPenalty?: number;
  finalScore?: number;
};

type SearchResponse = {
  items?: SearchItem[];
  error?: string;
};

type SummarizeResponse = {
  summary?: string;
  briefingId?: number;
  error?: string;
};

type SendResponse = {
  ok?: boolean;
  error?: string;
};

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} 환경변수가 비어 있습니다.`);
  }
  return value.trim();
}

export async function runDailyBriefing() {
  const baseUrl = getRequiredEnv("APP_BASE_URL");
  const query = getRequiredEnv("DAILY_BRIEFING_QUERY");
  const to = getRequiredEnv("DAILY_BRIEFING_TO");

  const searchRes = await fetch(`${baseUrl}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  const searchData = await safeJson<SearchResponse>(searchRes);

  if (!searchRes.ok) {
    throw new Error(searchData.error || "기사 검색 실패");
  }

  const searchItems = Array.isArray(searchData.items) ? searchData.items : [];
  if (!searchItems.length) {
    throw new Error("검색 결과가 없습니다.");
  }

  const top20 = searchItems.slice(0, 20);

  const rerankRes = await fetch(`${baseUrl}/api/rerank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      items: top20,
    }),
    cache: "no-store",
  });

  const rerankData = await safeJson<{ items?: SearchItem[]; error?: string }>(rerankRes);

  const finalItems =
    rerankRes.ok && Array.isArray(rerankData.items) && rerankData.items.length
      ? rerankData.items.slice(0, 10)
      : top20.slice(0, 10);

  const summarizeRes = await fetch(`${baseUrl}/api/summarize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      items: finalItems,
      category: "전체",
    }),
    cache: "no-store",
  });

  const summarizeData = await safeJson<SummarizeResponse>(summarizeRes);

  if (!summarizeRes.ok) {
    throw new Error(summarizeData.error || "요약 실패");
  }

  if (!summarizeData.summary) {
    throw new Error("요약 결과가 비어 있습니다.");
  }

  const sendRes = await fetch(`${baseUrl}/api/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      query,
      summary: summarizeData.summary,
      items: finalItems,
      briefingId: summarizeData.briefingId || null,
      category: "전체",
    }),
    cache: "no-store",
  });

  const sendData = await safeJson<SendResponse>(sendRes);

  if (!sendRes.ok) {
    throw new Error(sendData.error || "메일 발송 실패");
  }

  return {
    ok: true,
    query,
    to,
    count: finalItems.length,
    briefingId: summarizeData.briefingId || null,
  };
}
