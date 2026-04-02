// app/page.tsx - 메인 페이지, 뉴스 30개 검색 후 최종 선정 기사 10개만 화면에 보이도록 정리
// 2026-03-27 : UI 업그레이드, AI 추천 기능 추가
// 2026-03-30 : 검색 결과에 점수 정보 포함, 상위 20개 --> Gemini 재선별
// (2026-04-02) app/page.tsx : 메뉴 재구성

"use client";

import { KeyboardEvent, useEffect, useMemo, useState } from "react";

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

type SavedQuery = {
  id: number;
  name: string;
  query: string;
  category: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

type BriefingHistory = {
  id: number;
  query: string;
  summary: string;
  categoryTag: string | null;
  sentTo: string | null;
  sentAt: string | null;
  createdAt: string;
  items: {
    id: number;
    rankOrder: number;
    news: {
      id: number;
      title: string;
      link: string;
      snippet: string | null;
      summary?: string | null;
      sourceQuery?: string | null;
      pubDate: string | null;
    };
  }[];
};

type BriefingDetail = BriefingHistory | null;

type RecommendationItem = {
  keyword: string;
  reason: string;
};

const CATEGORY_OPTIONS = [
  "전체",
  "반도체",
  "AI",
  "메모리",
  "클라우드",
  "금융",
  "물류",
  "기타",
];

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function normalizeText(value: string) {
  return String(value || "").toLowerCase().trim();
}

function extractQueryTerms(query: string) {
  return String(query || "")
    .replace(/[|,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);
}

function getStopWords() {
  return new Set([
    "and",
    "or",
    "the",
    "a",
    "an",
    "of",
    "for",
    "to",
    "in",
    "on",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "as",
    "at",
    "from",
    "news",
    "briefing",
    "브리핑",
    "뉴스",
    "관련",
    "대한",
    "에서",
    "으로",
    "그리고",
    "또는",
    "및",
  ]);
}

function buildDynamicKeywords(query: string) {
  const stopWords = getStopWords();

  const baseTerms = extractQueryTerms(query)
    .map((term) => term.trim())
    .filter((term) => {
      const lower = term.toLowerCase();
      if (!term) return false;
      if (stopWords.has(lower)) return false;
      if (term.length <= 1) return false;
      return true;
    });

  const strongKeywords = Array.from(
    new Set(baseTerms.map((term) => normalizeText(term)))
  );

  const relatedAliases: Record<string, string[]> = {
    samsung: ["samsung", "삼성", "삼성전자"],
    hynix: ["hynix", "sk hynix", "sk하이닉스", "하이닉스"],
    micron: ["micron", "마이크론"],
    nvidia: ["nvidia", "엔비디아"],
    openai: ["openai", "chatgpt"],
    gemini: ["gemini", "google ai"],
    claude: ["claude", "anthropic"],
    ai: ["ai", "인공지능"],
    api: ["api"],
    gpu: ["gpu"],
    cpu: ["cpu"],
    hbm: ["hbm", "고대역폭메모리", "high bandwidth memory"],
    hbf: ["hbf"],
    dram: ["dram", "d램", "디램"],
    nand: ["nand", "낸드"],
  };

  const expanded = new Set<string>();

  for (const term of strongKeywords) {
    expanded.add(term);

    for (const aliases of Object.values(relatedAliases)) {
      if (
        aliases.some(
          (alias) =>
            alias.toLowerCase().includes(term) ||
            term.includes(alias.toLowerCase())
        )
      ) {
        aliases.forEach((alias) => expanded.add(alias.toLowerCase()));
      }
    }
  }

  return {
    strongKeywords,
    relatedKeywords: Array.from(expanded),
  };
}

function scoreArticleFallback(item: SearchItem, query: string) {
  const text = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
  const { strongKeywords, relatedKeywords } = buildDynamicKeywords(query);

  let score = 0;

  for (const keyword of strongKeywords) {
    if (text.includes(keyword)) score += 6;
  }

  for (const keyword of relatedKeywords) {
    if (text.includes(keyword)) score += 2;
  }

  const title = (item.title || "").toLowerCase();
  for (const keyword of strongKeywords) {
    if (title.includes(keyword)) score += 4;
  }

  const pubTime = new Date(item.pubDate || "").getTime();
  if (!Number.isNaN(pubTime) && pubTime > 0) {
    const ageHours = Math.max(0, (Date.now() - pubTime) / (1000 * 60 * 60));
    if (ageHours <= 24) score += 4;
    else if (ageHours <= 72) score += 3;
    else if (ageHours <= 168) score += 2;
    else if (ageHours <= 336) score += 1;
  }

  return score;
}

function getRankScore(item: SearchItem, query: string) {
  if (typeof item.finalScore === "number") return item.finalScore;
  return scoreArticleFallback(item, query);
}

export default function NewsPage() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [savedQueryName, setSavedQueryName] = useState("");

  const [rawItems, setRawItems] = useState<SearchItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<SearchItem[]>([]);
  const [summary, setSummary] = useState("");
  const [briefingId, setBriefingId] = useState<number | null>(null);
  const [email, setEmail] = useState("");

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [briefings, setBriefings] = useState<BriefingHistory[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<BriefingDetail>(null);
  const [selectedBriefingId, setSelectedBriefingId] = useState<number | null>(null);

  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [recommendationSource, setRecommendationSource] = useState<"AI" | "RULE" | "">("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [reranking, setReranking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingQuery, setSavingQuery] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [deletingBriefingId, setDeletingBriefingId] = useState<number | null>(null);
  const [updatingSavedQueryId, setUpdatingSavedQueryId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const preRankedItems = useMemo(() => {
    if (!rawItems.length) return [];

    return [...rawItems]
      .map((item) => ({
        ...item,
        _score: getRankScore(item, query),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 20);
  }, [rawItems, query]);

  const filteredSavedQueries = useMemo(() => {
    if (selectedCategory === "전체") return savedQueries;
    return savedQueries.filter((item) => item.category === selectedCategory);
  }, [savedQueries, selectedCategory]);

  const uncategorizedCount = useMemo(() => {
    return savedQueries.filter(
      (item) => !item.category || item.category === "미분류"
    ).length;
  }, [savedQueries]);

  const loadSavedQueries = async () => {
    try {
      const qs =
        selectedCategory && selectedCategory !== "전체"
          ? `?category=${encodeURIComponent(selectedCategory)}`
          : "";

      const res = await fetch(`/api/saved-queries${qs}`);
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "저장 키워드 조회 실패");
      }

      setSavedQueries(((data as any).data || []) as SavedQuery[]);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadBriefings = async () => {
    try {
      setHistoryLoading(true);
      const res = await fetch("/api/briefings");
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "브리핑 히스토리 조회 실패");
      }

      setBriefings(((data as any).data || []) as BriefingHistory[]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadBriefingDetail = async (id: number) => {
    try {
      const res = await fetch(`/api/briefings/${id}`);
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "브리핑 상세 조회 실패");
      }

      const detail = ((data as any).data || data) as BriefingHistory;
      setSelectedBriefing({
        ...detail,
        items: Array.isArray(detail?.items) ? detail.items : [],
      });
      setSelectedBriefingId(id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "브리핑 상세 조회 중 오류가 발생했습니다.");
    }
  };

  const loadRecommendations = async () => {
    try {
      setRecommendationLoading(true);
      const res = await fetch("/api/recommendations");
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "추천 키워드 조회 실패");
      }

      setRecommendations(((data as any).data || []) as RecommendationItem[]);
      setRecommendationSource(((data as any).source || "") as "AI" | "RULE" | "");
    } catch (err: any) {
      console.error(err);
      setRecommendations([]);
      setRecommendationSource("RULE");
    } finally {
      setRecommendationLoading(false);
    }
  };

  useEffect(() => {
    loadSavedQueries();
  }, [selectedCategory]);

  useEffect(() => {
    loadBriefings();
    loadRecommendations();
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    setReranking(false);
    setError("");
    setNotice("");
    setRawItems([]);
    setSelectedItems([]);
    setSummary("");
    setBriefingId(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "검색 실패");
      }

      const fetchedItems: SearchItem[] = ((data as any).items || []) as SearchItem[];
      setRawItems(fetchedItems);

      if (!fetchedItems.length) {
        setSelectedItems([]);
        return;
      }

      setReranking(true);

      const preRanked = [...fetchedItems]
        .map((item) => ({
          ...item,
          _score: getRankScore(item, query),
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 20);

      const rerankRes = await fetch("/api/rerank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          items: preRanked,
        }),
      });

      const rerankData = await parseJsonSafe(rerankRes);

      if (!rerankRes.ok) {
        console.error("rerank fallback:", (rerankData as any).error || "재선별 실패");
        setSelectedItems(preRanked.slice(0, 10));
        setNotice("Gemini 재선별에 실패하여 1차 후보 10개로 대체했습니다.");
      } else {
        const finalItems = Array.isArray((rerankData as any).items)
          ? ((rerankData as any).items as SearchItem[]).slice(0, 10)
          : [];
        setSelectedItems(finalItems);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setReranking(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedItems.length) return;

    setSummarizing(true);
    setError("");
    setNotice("");
    setSummary("");
    setBriefingId(null);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          items: selectedItems,
          category: selectedCategory,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "요약 실패");
      }

      setSummary((data as any).summary || "");
      setBriefingId((data as any).briefingId || null);
      await loadBriefings();
      await loadRecommendations();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "요약 중 오류가 발생했습니다.");
    } finally {
      setSummarizing(false);
    }
  };

  const handleSendMail = async () => {
    if (!email || !summary || !selectedItems.length) return;

    setSending(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          summary,
          items: selectedItems,
          query,
          briefingId,
          category: selectedCategory,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "메일 발송 실패");
      }

      setNotice("메일 발송이 완료되었습니다.");
      await loadBriefings();
      await loadRecommendations();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "메일 발송 중 오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  const handleSaveQuery = async () => {
    const effectiveQuery = query.trim() || savedQueryName.trim();
    const effectiveName = savedQueryName.trim() || effectiveQuery;

    if (!effectiveQuery) {
      setError("저장할 검색어가 비어 있습니다.");
      return;
    }

    setSavingQuery(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/saved-queries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: effectiveName,
          query: effectiveQuery,
          category: selectedCategory,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "키워드 저장 실패");
      }

      setSavedQueryName("");
      if (!query.trim()) {
        setQuery(effectiveQuery);
      }

      setNotice(`키워드가 저장되었습니다. 카테고리: ${(data as any).category || "기타"}`);
      await loadSavedQueries();
      await loadRecommendations();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "키워드 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingQuery(false);
    }
  };

  const handleClassifyUncategorized = async () => {
    setClassifying(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/saved-queries/classify", {
        method: "POST",
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "미분류 자동 분류 실패");
      }

      setNotice(`${(data as any).count || 0}건의 미분류 키워드를 자동 분류했습니다.`);
      await loadSavedQueries();
      await loadRecommendations();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "미분류 자동 분류 중 오류가 발생했습니다.");
    } finally {
      setClassifying(false);
    }
  };

  const handleApplySavedQuery = (item: SavedQuery) => {
    setQuery(item.query);
    setSelectedCategory(item.category || "전체");
    setNotice(`저장 키워드 "${item.name}"를 불러왔습니다.`);
  };

  const handleApplyRecommendation = (item: RecommendationItem) => {
    setQuery(item.keyword);
    setNotice(`추천 키워드 "${item.keyword}"를 적용했습니다.`);
  };

  const handleToggleFavorite = async (item: SavedQuery) => {
    try {
      setUpdatingSavedQueryId(item.id);
      const res = await fetch(`/api/saved-queries/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isFavorite: !item.isFavorite,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "즐겨찾기 변경 실패");
      }

      await loadSavedQueries();
      await loadRecommendations();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "즐겨찾기 변경 중 오류가 발생했습니다.");
    } finally {
      setUpdatingSavedQueryId(null);
    }
  };

  const handleUpdateSavedQueryCategory = async (
    item: SavedQuery,
    nextCategory: string
  ) => {
    try {
      setUpdatingSavedQueryId(item.id);
      setError("");
      setNotice("");

      const res = await fetch(`/api/saved-queries/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: nextCategory,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "카테고리 수정 실패");
      }

      setNotice(`"${item.name}" 카테고리를 ${nextCategory}(으)로 변경했습니다.`);
      await loadSavedQueries();
      await loadRecommendations();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "카테고리 수정 중 오류가 발생했습니다.");
    } finally {
      setUpdatingSavedQueryId(null);
    }
  };

  const handleDeleteSavedQuery = async (id: number) => {
    try {
      setUpdatingSavedQueryId(id);
      const res = await fetch(`/api/saved-queries/${id}`, {
        method: "DELETE",
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "삭제 실패");
      }

      setNotice("저장 키워드가 삭제되었습니다.");
      await loadSavedQueries();
      await loadRecommendations();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "저장 키워드 삭제 중 오류가 발생했습니다.");
    } finally {
      setUpdatingSavedQueryId(null);
    }
  };

  const handleDeleteBriefing = async (id: number) => {
    const confirmed = window.confirm("이 브리핑 히스토리를 삭제할까요?");
    if (!confirmed) return;

    try {
      setDeletingBriefingId(id);
      setError("");
      setNotice("");

      const res = await fetch(`/api/briefings/${id}`, {
        method: "DELETE",
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "브리핑 삭제 실패");
      }

      if (selectedBriefingId === id) {
        setSelectedBriefing(null);
        setSelectedBriefingId(null);
      }

      await loadBriefings();
      await loadRecommendations();
      setNotice("브리핑이 삭제되었습니다.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "브리핑 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingBriefingId(null);
    }
  };

  const handleQueryKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && query.trim()) {
        handleSearch();
      }
    }
  };

  return (
    <main
      style={{
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "24px 20px 40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "8px" }}>뉴스 브리핑</h1>
      <p style={{ marginTop: 0, color: "#475569" }}>
        3단계 랭킹 알고리즘(TF-IDF + 중복 제거 + 중요도 scoring)까지 반영된 최종본입니다.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr 360px",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <aside
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "16px",
            background: "#fff",
            position: "sticky",
            top: "16px",
          }}
        >
          <h3 style={{ marginTop: 0 }}>카테고리</h3>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
              marginBottom: "16px",
            }}
          >
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "16px",
              alignItems: "center",
            }}
          >
            <button
              onClick={handleClassifyUncategorized}
              disabled={classifying || uncategorizedCount === 0}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                background: "#7c3aed",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {classifying ? "분류 중..." : "미분류 자동 분류"}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              {uncategorizedCount}건
            </span>
          </div>

          <h3>추천 키워드</h3>

          <div style={{ marginBottom: "12px" }}>
            <button
              onClick={loadRecommendations}
              disabled={recommendationLoading}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                background: "#2563eb",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {recommendationLoading ? "추천 생성 중..." : "추천 키워드 새로고침"}
            </button>
          </div>

          {recommendationSource && (
            <div
              style={{
                marginBottom: "12px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              추천 방식: {recommendationSource === "AI" ? "AI" : "규칙 기반"}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
            {recommendations.length === 0 && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  color: "#64748b",
                  fontSize: "14px",
                }}
              >
                추천 키워드가 없습니다.
              </div>
            )}

            {recommendations.map((item, index) => (
              <div
                key={`${item.keyword}-${index}`}
                style={{
                  border: "1px solid #dbeafe",
                  borderRadius: "12px",
                  padding: "12px",
                  background: "#f8fbff",
                }}
              >
                <div style={{ fontWeight: 700 }}>{item.keyword}</div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: "#475569",
                    lineHeight: 1.5,
                  }}
                >
                  {item.reason}
                </div>

                <button
                  onClick={() => handleApplyRecommendation(item)}
                  style={{
                    marginTop: "10px",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#111827",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  적용
                </button>
              </div>
            ))}
          </div>

          <h3>저장 키워드</h3>

          {filteredSavedQueries.length === 0 && (
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              저장된 키워드가 없습니다.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredSavedQueries.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px",
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span>{item.name}</span>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    {item.isFavorite ? "★" : "☆"}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: "#475569",
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}
                >
                  {item.query}
                </div>

                <div style={{ marginTop: "10px" }}>
                  <select
                    value={item.category || "기타"}
                    onChange={(e) =>
                      handleUpdateSavedQueryCategory(item, e.target.value)
                    }
                    disabled={updatingSavedQueryId === item.id}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #d1d5db",
                      fontSize: "12px",
                    }}
                  >
                    {CATEGORY_OPTIONS.filter((x) => x !== "전체").map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    marginTop: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => handleApplySavedQuery(item)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#111827",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    불러오기
                  </button>
                  <button
                    onClick={() => handleToggleFavorite(item)}
                    disabled={updatingSavedQueryId === item.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {updatingSavedQueryId === item.id
                      ? "처리 중..."
                      : item.isFavorite
                      ? "즐겨찾기 해제"
                      : "즐겨찾기"}
                  </button>
                  <button
                    onClick={() => handleDeleteSavedQuery(item.id)}
                    disabled={updatingSavedQueryId === item.id}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid #fecaca",
                      background: "#fff5f5",
                      color: "#b91c1c",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {updatingSavedQueryId === item.id ? "삭제 중..." : "삭제"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "20px",
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 220px",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleQueryKeyDown}
                placeholder={`예: CJ대한통운 / HBM / OpenAI API pricing / 중동 정세 반도체 공급망 / 박재범 /
Enter: 검색 / Shift+Enter: 줄바꿈`}
                rows={4}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  resize: "vertical",
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <input
                  value={savedQueryName}
                  onChange={(e) => setSavedQueryName(e.target.value)}
                  placeholder="저장 이름 (비워두면 검색어 사용)"
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid #ccc",
                  }}
                />
                <button
                  onClick={handleSaveQuery}
                  disabled={savingQuery || (!query.trim() && !savedQueryName.trim())}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#0f766e",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {savingQuery ? "저장 중..." : "키워드 저장"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "8px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                style={{
                  padding: "12px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {loading ? "검색 중..." : "기사 검색"}
              </button>

              <button
                onClick={handleSummarize}
                disabled={summarizing || !selectedItems.length}
                style={{
                  padding: "12px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {summarizing ? "요약 중..." : "Gemini 요약"}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "16px",
                alignItems: "center",
              }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="받을 이메일 주소"
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                }}
              />

              <button
                onClick={handleSendMail}
                disabled={sending || !summary || !selectedItems.length || !email}
                style={{
                  padding: "12px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#16a34a",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {sending ? "보내는 중..." : "메일 보내기"}
              </button>
            </div>
          </div>

          {error && (
            <pre
              style={{
                color: "red",
                marginTop: "20px",
                whiteSpace: "pre-wrap",
                background: "#fff5f5",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #fecaca",
              }}
            >
              {error}
            </pre>
          )}

          {notice && (
            <div
              style={{
                marginTop: "20px",
                whiteSpace: "pre-wrap",
                background: "#fffbea",
                color: "#92400e",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #fde68a",
              }}
            >
              {notice}
            </div>
          )}

          {!!briefingId && (
            <div
              style={{
                marginTop: "20px",
                background: "#f0fdf4",
                color: "#166534",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #bbf7d0",
              }}
            >
              브리핑 저장 완료 (ID: {briefingId})
            </div>
          )}

          {!!rawItems.length && (
            <div
              style={{
                marginTop: "24px",
                padding: "12px 16px",
                borderRadius: "10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#334155",
                fontSize: "14px",
              }}
            >
              전체 수집 기사 수: <strong>{rawItems.length}</strong>개
              {" / "}
              알고리즘 상위 후보 수: <strong>{preRankedItems.length}</strong>개
              {" / "}
              최종 선정 기사 수: <strong>{selectedItems.length}</strong>개
              {reranking && (
                <span style={{ marginLeft: "10px", color: "#2563eb" }}>
                  · Gemini 재선별 중...
                </span>
              )}
            </div>
          )}

          {!!summary && (
            <div
              style={{
                marginTop: "24px",
                padding: "16px",
                border: "1px solid #dbeafe",
                background: "#eff6ff",
                borderRadius: "12px",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Gemini 요약</h2>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{summary}</pre>
            </div>
          )}

          <div style={{ marginTop: "24px" }}>
            <h2 style={{ marginBottom: "16px" }}>최종 선정 기사 10개</h2>

            {selectedItems.length === 0 && (
              <div
                style={{
                  padding: "16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  background: "#fff",
                  color: "#6b7280",
                }}
              >
                아직 선정된 기사가 없습니다.
              </div>
            )}

            {selectedItems.map((item, index) => (
              <div
                key={`${item.link}-${index}`}
                style={{
                  padding: "16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  marginBottom: "16px",
                  background: index < 3 ? "#f8fbff" : "#fff",
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    background: index < 3 ? "#2563eb" : "#e5e7eb",
                    color: index < 3 ? "#fff" : "#111827",
                    fontSize: "12px",
                    fontWeight: 700,
                    marginBottom: "10px",
                  }}
                >
                  {index < 3 ? `TOP ${index + 1}` : `선정 ${index + 1}`}
                </div>

                <h3 style={{ marginTop: 0, marginBottom: "8px" }}>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                </h3>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "8px",
                    fontSize: "12px",
                    color: "#64748b",
                  }}
                >
                  <span>{item.pubDate}</span>
                  {item.sourceDomain && <span>· {item.sourceDomain}</span>}
                  {typeof item.finalScore === "number" && (
                    <span>· 점수 {item.finalScore.toFixed(2)}</span>
                  )}
                </div>

                {(typeof item.keywordScore === "number" ||
                  typeof item.tfidfScore === "number" ||
                  typeof item.freshnessScore === "number" ||
                  typeof item.importanceScore === "number") && (
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      marginBottom: "10px",
                      fontSize: "12px",
                      color: "#475569",
                    }}
                  >
                    {typeof item.keywordScore === "number" && (
                      <span>키워드 {item.keywordScore.toFixed(1)}</span>
                    )}
                    {typeof item.tfidfScore === "number" && (
                      <span>TF-IDF {item.tfidfScore.toFixed(1)}</span>
                    )}
                    {typeof item.freshnessScore === "number" && (
                      <span>최신성 {item.freshnessScore.toFixed(1)}</span>
                    )}
                    {typeof item.importanceScore === "number" && (
                      <span>중요도 {item.importanceScore.toFixed(1)}</span>
                    )}
                    {typeof item.diversityPenalty === "number" &&
                      item.diversityPenalty > 0 && (
                        <span>다양성 패널티 -{item.diversityPenalty.toFixed(1)}</span>
                      )}
                  </div>
                )}

                {item.snippet && <p style={{ margin: 0 }}>{item.snippet}</p>}
              </div>
            ))}
          </div>
        </section>

        <aside
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "16px",
            background: "#fff",
            position: "sticky",
            top: "16px",
            maxHeight: "calc(100vh - 32px)",
            overflow: "auto",
          }}
        >
          <h3 style={{ marginTop: 0 }}>브리핑 히스토리</h3>

          {historyLoading && (
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              히스토리 불러오는 중...
            </div>
          )}

          {!historyLoading && briefings.length === 0 && (
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: "#f8fafc",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              저장된 브리핑이 없습니다.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {briefings.map((item) => {
              const isSelected = selectedBriefingId === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    border: isSelected ? "2px solid #2563eb" : "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "12px",
                    background: isSelected ? "#eff6ff" : "#fafafa",
                  }}
                >
                  <button
                    onClick={() => loadBriefingDetail(item.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{item.query}</div>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b" }}>
                      {item.categoryTag || "미분류"} ·{" "}
                      {new Date(item.createdAt).toLocaleString("ko-KR")}
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "13px",
                        color: "#334155",
                        lineHeight: 1.5,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {item.summary}
                    </div>
                  </button>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "10px",
                    }}
                  >
                    <button
                      onClick={() => loadBriefingDetail(item.id)}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      {isSelected ? "선택됨" : "선택"}
                    </button>
                    <button
                      onClick={() => handleDeleteBriefing(item.id)}
                      disabled={deletingBriefingId === item.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #fecaca",
                        background: "#fff5f5",
                        color: "#b91c1c",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      {deletingBriefingId === item.id ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedBriefing && (
            <div
              style={{
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid #e5e7eb",
              }}
            >
              <h3 style={{ marginTop: 0 }}>선택한 브리핑</h3>

              <div style={{ fontWeight: 700 }}>{selectedBriefing.query}</div>

              <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b" }}>
                {selectedBriefing.categoryTag || "미분류"} ·{" "}
                {new Date(selectedBriefing.createdAt).toLocaleString("ko-KR")}
              </div>

              {selectedBriefing.sentTo && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#166534" }}>
                  발송됨: {selectedBriefing.sentTo}
                </div>
              )}

              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  marginTop: "12px",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  background: "#f8fafc",
                  padding: "10px",
                  borderRadius: "10px",
                }}
              >
                {selectedBriefing.summary}
              </pre>

              <div style={{ marginTop: "12px", fontWeight: 700 }}>기사 목록</div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  marginTop: "8px",
                }}
              >
                {(selectedBriefing.items || []).map((item) => (
                  <a
                    key={item.id}
                    href={item.news.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block",
                      padding: "10px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "10px",
                      textDecoration: "none",
                      color: "#111827",
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                      {item.rankOrder}위
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>
                      {item.news.title}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
