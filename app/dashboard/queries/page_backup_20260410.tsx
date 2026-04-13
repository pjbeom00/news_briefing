// app/dashboard/queries/page.tsx
// (2026-04-06) File: app/dashboard/queries/page.tsx
// (2026-04-07) 업그레이드 포인트:
// 1) 중복 품질 차트 추가
// 2) 평균 중복 품질/평균 기사 수 카드 추가
// 3) 기존 원클릭 실행/저장 이름/카테고리 수정 흐름 유지

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type QueryPerformanceRow = {
  query: string;
  totalBriefings: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  successRate: number;
  lastUsedAt: string | null;
  templateExecutiveCount: number;
  templatePracticalCount: number;
  topCategory: string;
  duplicateQualityScore: number;
  averageDuplicateCount: number;
  averageArticleCount: number;
  savedQueryId: number | null;
  savedQueryName: string | null;
  savedQueryCategory: string | null;
  savedQueryFavorite: boolean;
};

type ChartItem = {
  label: string;
  value: number;
};

type DailyTrendItem = {
  day: string;
  count: number;
  sent: number;
  successRate: number;
};

type SortKey =
  | "totalBriefings"
  | "sentCount"
  | "successRate"
  | "lastUsedAt"
  | "templateExecutiveCount"
  | "templatePracticalCount"
  | "duplicateQualityScore";

type ResponseShape = {
  data: QueryPerformanceRow[];
  total: number;
  charts: {
    topQueries: ChartItem[];
    successRateTop: ChartItem[];
    duplicateQualityTop: ChartItem[];
    templateDistribution: ChartItem[];
    dailyTrend: DailyTrendItem[];
  };
};

type ExecuteModalState = {
  open: boolean;
  query: string;
  to: string;
  templateType: "EXECUTIVE" | "PRACTICAL";
  category: string;
  deliveryMode: "SEND" | "DRAFT";
};

type ExecuteResultState = {
  visible: boolean;
  query: string;
  briefingId: number | null;
  deliveryMode: "SEND" | "DRAFT";
  adminDetailUrl: string | null;
  adminListUrl: string | null;
  gmailDraftsUrl: string | null;
  searchedCount: number;
  finalCount: number;
  to: string;
  message: string;
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function MetricMiniCard(props: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "18px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          color: "#64748b",
          fontWeight: 700,
          marginBottom: "8px",
        }}
      >
        {props.title}
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: 800,
          color: "#0f172a",
          marginBottom: "6px",
        }}
      >
        {props.value}
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "#475569",
          lineHeight: 1.6,
        }}
      >
        {props.description}
      </div>
    </div>
  );
}

function BarChartCard(props: {
  title: string;
  items: ChartItem[];
  suffix?: string;
}) {
  const maxValue = Math.max(...props.items.map((item) => item.value), 1);

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "20px",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "14px" }}>{props.title}</h2>

      {!props.items.length ? (
        <div style={{ color: "#64748b" }}>표시할 데이터가 없습니다.</div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {props.items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  marginBottom: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#0f172a",
                    wordBreak: "break-word",
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#475569",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.value}
                  {props.suffix || ""}
                </div>
              </div>

              <div
                style={{
                  height: "12px",
                  borderRadius: "999px",
                  background: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(item.value / maxValue) * 100}%`,
                    height: "100%",
                    background: "#2563eb",
                    borderRadius: "999px",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LineTrendCard(props: {
  title: string;
  items: DailyTrendItem[];
  valueKey: "count" | "sent" | "successRate";
}) {
  const values = props.items.map((item) => item[props.valueKey]);
  const maxValue = Math.max(...values, 1);

  const points = props.items
    .map((item, index) => {
      const x = (index / Math.max(props.items.length - 1, 1)) * 100;
      const y = 100 - (item[props.valueKey] / maxValue) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "20px",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "14px" }}>{props.title}</h2>

      {!props.items.length ? (
        <div style={{ color: "#64748b" }}>표시할 데이터가 없습니다.</div>
      ) : (
        <>
          <div
            style={{
              width: "100%",
              height: "220px",
              borderRadius: "12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: "16px",
              boxSizing: "border-box",
            }}
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ width: "100%", height: "100%" }}
            >
              <polyline
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                points={points}
              />
            </svg>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${props.items.length}, minmax(0, 1fr))`,
              gap: "8px",
              marginTop: "12px",
            }}
          >
            {props.items.map((item) => (
              <div key={item.day} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#0f172a",
                    fontWeight: 800,
                  }}
                >
                  {item[props.valueKey]}
                  {props.valueKey === "successRate" ? "%" : ""}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  {item.day.slice(5)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function QualityBadge({ score }: { score: number }) {
  let background = "#dcfce7";
  let color = "#166534";
  let label = "매우 좋음";

  if (score < 90) {
    background = "#dbeafe";
    color = "#1d4ed8";
    label = "좋음";
  }
  if (score < 75) {
    background = "#fef3c7";
    color = "#92400e";
    label = "보통";
  }
  if (score < 60) {
    background = "#fee2e2";
    color = "#b91c1c";
    label = "중복 높음";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        borderRadius: "999px",
        background,
        color,
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      품질 {score}점 · {label}
    </span>
  );
}

export default function QueryPerformancePage() {
  const [rows, setRows] = useState<QueryPerformanceRow[]>([]);
  const [charts, setCharts] = useState<ResponseShape["charts"]>({
    topQueries: [],
    successRateTop: [],
    duplicateQualityTop: [],
    templateDistribution: [],
    dailyTrend: [],
  });
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [keyword, setKeyword] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("totalBriefings");

  const [editNameMap, setEditNameMap] = useState<Record<string, string>>({});
  const [editCategoryMap, setEditCategoryMap] = useState<Record<string, string>>({});

  const [executeModal, setExecuteModal] = useState<ExecuteModalState>({
    open: false,
    query: "",
    to: "",
    templateType: "EXECUTIVE",
    category: "",
    deliveryMode: "SEND",
  });

  const [executeResult, setExecuteResult] = useState<ExecuteResultState>({
    visible: false,
    query: "",
    briefingId: null,
    deliveryMode: "SEND",
    adminDetailUrl: null,
    adminListUrl: null,
    gmailDraftsUrl: null,
    searchedCount: 0,
    finalCount: 0,
    to: "",
    message: "",
  });

  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const base = rows.filter((row) => {
      const matchesKeyword =
        !normalizedKeyword ||
        `${row.query} ${row.savedQueryName || ""} ${row.topCategory || ""}`
          .toLowerCase()
          .includes(normalizedKeyword);

      const matchesFavorite = !onlyFavorites || row.savedQueryFavorite;

      return matchesKeyword && matchesFavorite;
    });

    return [...base].sort((a, b) => {
      if (sortKey === "lastUsedAt") {
        return (
          new Date(b.lastUsedAt || 0).getTime() -
          new Date(a.lastUsedAt || 0).getTime()
        );
      }

      return (b[sortKey] as number) - (a[sortKey] as number);
    });
  }, [rows, keyword, onlyFavorites, sortKey]);

  const summary = useMemo(() => {
    const totalQueries = filteredRows.length;
    const totalBriefings = filteredRows.reduce(
      (sum, row) => sum + row.totalBriefings,
      0
    );
    const totalSent = filteredRows.reduce((sum, row) => sum + row.sentCount, 0);
    const averageSuccessRate =
      totalQueries > 0
        ? Math.round(
            filteredRows.reduce((sum, row) => sum + row.successRate, 0) / totalQueries
          )
        : 0;
    const averageDuplicateQuality =
      totalQueries > 0
        ? Math.round(
            filteredRows.reduce((sum, row) => sum + row.duplicateQualityScore, 0) /
              totalQueries
          )
        : 100;

    return {
      totalQueries,
      totalBriefings,
      totalSent,
      averageSuccessRate,
      averageDuplicateQuality,
    };
  }, [filteredRows]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dashboard/queries", {
        cache: "no-store",
      });
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "검색어 성과 조회 실패");
      }

      const parsed = data as ResponseShape;
      const nextRows = parsed.data || [];

      setRows(nextRows);
      setCharts(
        parsed.charts || {
          topQueries: [],
          successRateTop: [],
          duplicateQualityTop: [],
          templateDistribution: [],
          dailyTrend: [],
        }
      );

      const nextNameMap: Record<string, string> = {};
      const nextCategoryMap: Record<string, string> = {};

      nextRows.forEach((row) => {
        nextNameMap[row.query] = row.savedQueryName || row.query;
        nextCategoryMap[row.query] = row.savedQueryCategory || row.topCategory || "";
      });

      setEditNameMap(nextNameMap);
      setEditCategoryMap(nextCategoryMap);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "검색어 성과 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGoSearch = (query: string) => {
    window.location.href = `/news?query=${encodeURIComponent(query)}`;
  };

  const handleGoAdmin = (query: string) => {
    window.location.href = `/admin/briefings?query=${encodeURIComponent(query)}`;
  };

  const handleToggleFavorite = async (row: QueryPerformanceRow) => {
    try {
      setActionLoading(true);
      setError("");
      setNotice("");

      const res = await fetch("/api/saved-queries/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: row.query,
          name: row.savedQueryName || row.query,
          category: row.savedQueryCategory || row.topCategory || null,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "즐겨찾기 토글 실패");
      }

      setNotice(
        row.savedQueryFavorite
          ? "검색어 즐겨찾기를 해제했습니다."
          : "검색어를 즐겨찾기에 추가했습니다."
      );

      await loadData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "즐겨찾기 처리 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRename = async (row: QueryPerformanceRow) => {
    try {
      setActionLoading(true);
      setError("");
      setNotice("");

      const name = String(editNameMap[row.query] || "").trim();

      if (!name) {
        throw new Error("저장 이름이 비어 있습니다.");
      }

      const res = await fetch("/api/saved-queries/rename", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: row.query,
          name,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "저장 이름 수정 실패");
      }

      setNotice(`"${row.query}" 저장 이름을 "${name}"(으)로 수정했습니다.`);
      await loadData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "저장 이름 수정 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCategorySave = async (row: QueryPerformanceRow) => {
    try {
      setActionLoading(true);
      setError("");
      setNotice("");

      const category = String(editCategoryMap[row.query] || "").trim();

      const res = await fetch("/api/saved-queries/category", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: row.query,
          category: category || null,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "카테고리 수정 실패");
      }

      setNotice(
        `"${row.query}" 저장 카테고리를 "${category || "없음"}"(으)로 수정했습니다.`
      );
      await loadData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "저장 카테고리 수정 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  const openExecuteModal = (row: QueryPerformanceRow) => {
    setExecuteModal({
      open: true,
      query: row.query,
      to: "",
      templateType: "EXECUTIVE",
      category: row.savedQueryCategory || row.topCategory || "",
      deliveryMode: "SEND",
    });
  };

  const closeExecuteModal = () => {
    setExecuteModal({
      open: false,
      query: "",
      to: "",
      templateType: "EXECUTIVE",
      category: "",
      deliveryMode: "SEND",
    });
  };

  const handleExecuteBriefing = async () => {
    try {
      setActionLoading(true);
      setError("");
      setNotice("");
      setExecuteResult({
        visible: false,
        query: "",
        briefingId: null,
        deliveryMode: "SEND",
        adminDetailUrl: null,
        adminListUrl: null,
        gmailDraftsUrl: null,
        searchedCount: 0,
        finalCount: 0,
        to: "",
        message: "",
      });

      const res = await fetch("/api/briefings/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: executeModal.query,
          to: executeModal.to || undefined,
          templateType: executeModal.templateType,
          category: executeModal.category || null,
          deliveryMode: executeModal.deliveryMode,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "원클릭 브리핑 실행 중 오류가 발생했습니다.");
      }

      setNotice(
        `${String((data as any).message || "원클릭 실행 완료")}
- 검색어: ${executeModal.query}
- 템플릿: ${executeModal.templateType}
- 모드: ${executeModal.deliveryMode === "DRAFT" ? "초안 생성" : "즉시 발송"}
- 수신자: ${String((data as any).to || executeModal.to || "-")}
- 검색 기사 수: ${String((data as any).searchedCount || 0)}
- 최종 기사 수: ${String((data as any).finalCount || 0)}
- 브리핑 ID: ${String((data as any).briefingId || "-")}`
      );

      setExecuteResult({
        visible: true,
        query: executeModal.query,
        briefingId: Number((data as any).briefingId || 0) || null,
        deliveryMode:
          String((data as any).deliveryMode || "SEND").toUpperCase() === "DRAFT"
            ? "DRAFT"
            : "SEND",
        adminDetailUrl: String((data as any).adminDetailUrl || "") || null,
        adminListUrl: String((data as any).adminListUrl || "") || null,
        gmailDraftsUrl: String((data as any).gmailDraftsUrl || "") || null,
        searchedCount: Number((data as any).searchedCount || 0),
        finalCount: Number((data as any).finalCount || 0),
        to: String((data as any).to || executeModal.to || ""),
        message: String((data as any).message || ""),
      });

      closeExecuteModal();
      await loadData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "원클릭 브리핑 실행 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <main
        style={{
          maxWidth: "1440px",
          margin: "0 auto",
          padding: "24px 20px 40px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: "18px",
          }}
        >
          <div>
            <h1 style={{ marginBottom: "8px" }}>검색어 성과 분석</h1>
            <p style={{ marginTop: 0, color: "#475569", lineHeight: 1.7 }}>
              검색어별 실행 성과, 중복 기사 품질, 템플릿 분포를 함께 보는 운영 분석 화면입니다.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/dashboard"
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              대시보드
            </Link>

            <Link
              href="/dashboard/executions"
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              원클릭 실행 로그
            </Link>

            <Link
              href="/dashboard/favorites"
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#334155",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              즐겨찾기 브리핑
            </Link>

            <button
              onClick={loadData}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {loading ? "새로고침 중..." : "새로고침"}
            </button>
          </div>
        </div>

        {error && (
          <pre
            style={{
              color: "red",
              whiteSpace: "pre-wrap",
              background: "#fff5f5",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #fecaca",
              marginBottom: "16px",
            }}
          >
            {error}
          </pre>
        )}

        {notice && (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f0fdf4",
              color: "#166534",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #bbf7d0",
              marginBottom: "16px",
            }}
          >
            {notice}
          </pre>
        )}

        {executeResult.visible && (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "14px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: 800,
                color: "#1d4ed8",
                marginBottom: "10px",
              }}
            >
              실행 결과 바로가기
            </div>

            <div
              style={{
                fontSize: "14px",
                color: "#334155",
                lineHeight: 1.8,
                marginBottom: "12px",
              }}
            >
              검색어: <strong>{executeResult.query}</strong>
              <br />
              모드:{" "}
              <strong>
                {executeResult.deliveryMode === "DRAFT" ? "초안 생성" : "즉시 발송"}
              </strong>
              <br />
              브리핑 ID: <strong>{executeResult.briefingId || "-"}</strong>
              <br />
              최종 기사 수: <strong>{executeResult.finalCount}</strong>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              {executeResult.adminDetailUrl && (
                <Link
                  href={executeResult.adminDetailUrl}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    background: "#111827",
                    color: "#fff",
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
                >
                  브리핑 상세 보기
                </Link>
              )}

              {executeResult.adminListUrl && (
                <Link
                  href={executeResult.adminListUrl}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#334155",
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
                >
                  관련 브리핑 목록 보기
                </Link>
              )}

              {executeResult.gmailDraftsUrl && (
                <a
                  href={executeResult.gmailDraftsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#334155",
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
                >
                  Gmail 초안함 열기
                </a>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: "14px",
            marginBottom: "20px",
          }}
        >
          <MetricMiniCard
            title="표시 검색어 수"
            value={summary.totalQueries}
            description="현재 필터 기준으로 표시되는 검색어 수"
          />
          <MetricMiniCard
            title="누적 브리핑 수"
            value={summary.totalBriefings}
            description="표시 검색어 기준 전체 브리핑 생성 횟수"
          />
          <MetricMiniCard
            title="누적 발송 성공"
            value={summary.totalSent}
            description="표시 검색어 기준 발송 완료 누적 수"
          />
          <MetricMiniCard
            title="평균 성공률"
            value={`${summary.averageSuccessRate}%`}
            description="표시 검색어 기준 평균 발송 성공률"
          />
          <MetricMiniCard
            title="평균 중복 품질"
            value={`${summary.averageDuplicateQuality}점`}
            description="최근 브리핑 기준 평균 중복 기사 품질 점수"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <BarChartCard title="상위 검색어" items={charts.topQueries} />
          <BarChartCard
            title="성공률 상위 검색어"
            items={charts.successRateTop}
            suffix="%"
          />
          <BarChartCard
            title="중복 품질 상위 검색어"
            items={charts.duplicateQualityTop}
            suffix="점"
          />
          <BarChartCard
            title="템플릿 분포"
            items={charts.templateDistribution}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <LineTrendCard
            title="최근 7일 브리핑 생성 추이"
            items={charts.dailyTrend}
            valueKey="count"
          />
          <LineTrendCard
            title="최근 7일 성공률 추이"
            items={charts.dailyTrend}
            valueKey="successRate"
          />
        </div>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 180px 180px 180px",
              gap: "12px",
            }}
          >
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="검색어 / 저장 이름 / 카테고리 검색"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                boxSizing: "border-box",
              }}
            />

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 10px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                background: "#fff",
                fontSize: "13px",
                fontWeight: 700,
                color: "#334155",
              }}
            >
              <input
                type="checkbox"
                checked={onlyFavorites}
                onChange={(e) => setOnlyFavorites(e.target.checked)}
              />
              즐겨찾기만
            </label>

            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
              }}
            >
              <option value="totalBriefings">브리핑 수순</option>
              <option value="sentCount">발송 성공순</option>
              <option value="successRate">성공률순</option>
              <option value="duplicateQualityScore">중복 품질순</option>
              <option value="lastUsedAt">최근 사용순</option>
              <option value="templateExecutiveCount">경영진용 많은 순</option>
              <option value="templatePracticalCount">실무형 많은 순</option>
            </select>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: "13px",
                fontWeight: 700,
                color: "#475569",
              }}
            >
              {filteredRows.length}건
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "20px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "14px" }}>검색어별 성과</h2>

          {loading && <div style={{ color: "#64748b" }}>불러오는 중...</div>}

          {!loading && filteredRows.length === 0 && (
            <div style={{ color: "#64748b" }}>검색 결과가 없습니다.</div>
          )}

          <div style={{ display: "grid", gap: "10px" }}>
            {filteredRows.map((row, index) => (
              <div
                key={`${row.query}-${index}`}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "14px",
                  padding: "16px 18px",
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "14px",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    marginBottom: "10px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "6px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 800,
                          color: "#0f172a",
                          wordBreak: "break-word",
                        }}
                      >
                        {row.query}
                      </div>

                      {row.savedQueryFavorite && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: "999px",
                            background: "#fef3c7",
                            color: "#92400e",
                          }}
                        >
                          즐겨찾기
                        </span>
                      )}

                      {row.savedQueryName && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: "999px",
                            background: "#e0f2fe",
                            color: "#0369a1",
                          }}
                        >
                          저장 이름: {row.savedQueryName}
                        </span>
                      )}

                      <QualityBadge score={row.duplicateQualityScore} />
                    </div>

                    <div
                      style={{
                        fontSize: "13px",
                        color: "#64748b",
                        lineHeight: 1.7,
                      }}
                    >
                      주요 카테고리: {row.topCategory} · 최근 사용:{" "}
                      {row.lastUsedAt
                        ? new Date(row.lastUsedAt).toLocaleString("ko-KR")
                        : "-"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: "#dbeafe",
                        color: "#1d4ed8",
                      }}
                    >
                      브리핑 {row.totalBriefings}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: "#dcfce7",
                        color: "#166534",
                      }}
                    >
                      성공 {row.sentCount}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: "#fee2e2",
                        color: "#b91c1c",
                      }}
                    >
                      실패 {row.failedCount}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: "#fef3c7",
                        color: "#92400e",
                      }}
                    >
                      성공률 {row.successRate}%
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                    gap: "10px",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: "6px",
                      }}
                    >
                      경영진용
                    </div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {row.templateExecutiveCount}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: "6px",
                      }}
                    >
                      실무형
                    </div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {row.templatePracticalCount}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: "6px",
                      }}
                    >
                      평균 기사 수
                    </div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {row.averageArticleCount}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: "6px",
                      }}
                    >
                      평균 중복 수
                    </div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {row.averageDuplicateCount}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: "6px",
                      }}
                    >
                      저장 카테고리
                    </div>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {row.savedQueryCategory || "-"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: "8px",
                      }}
                    >
                      저장 이름 수정
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        value={editNameMap[row.query] || ""}
                        onChange={(e) =>
                          setEditNameMap((prev) => ({
                            ...prev,
                            [row.query]: e.target.value,
                          }))
                        }
                        placeholder="저장 이름"
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #d1d5db",
                        }}
                      />

                      <button
                        onClick={() => handleRename(row)}
                        disabled={actionLoading}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#0f766e",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        저장
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginBottom: "8px",
                      }}
                    >
                      저장 카테고리 수정
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        value={editCategoryMap[row.query] || ""}
                        onChange={(e) =>
                          setEditCategoryMap((prev) => ({
                            ...prev,
                            [row.query]: e.target.value,
                          }))
                        }
                        placeholder="카테고리"
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: "8px",
                          border: "1px solid #d1d5db",
                        }}
                      />

                      <button
                        onClick={() => handleCategorySave(row)}
                        disabled={actionLoading}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#7c3aed",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => handleGoSearch(row.query)}
                    disabled={actionLoading}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    🔍 검색
                  </button>

                  <button
                    onClick={() => handleGoAdmin(row.query)}
                    disabled={actionLoading}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      color: "#334155",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    📊 이력
                  </button>

                  <button
                    onClick={() => handleToggleFavorite(row)}
                    disabled={actionLoading}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "none",
                      background: row.savedQueryFavorite ? "#f59e0b" : "#e5e7eb",
                      color: row.savedQueryFavorite ? "#fff" : "#334155",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⭐ {row.savedQueryFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  </button>

                  <button
                    onClick={() => openExecuteModal(row)}
                    disabled={actionLoading}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#16a34a",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⚡ 원클릭 실행
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {executeModal.open && (
        <div
          onClick={closeExecuteModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "680px",
              background: "#ffffff",
              borderRadius: "18px",
              padding: "24px",
              boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "18px",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: "6px",
                  }}
                >
                  원클릭 브리핑 실행
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#64748b",
                    lineHeight: 1.7,
                  }}
                >
                  검색 → 재선별 → 요약 → 메일 발송 또는 초안 생성까지 한 번에 실행합니다.
                </div>
              </div>

              <button
                onClick={closeExecuteModal}
                style={{
                  border: "none",
                  background: "#f1f5f9",
                  color: "#0f172a",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "18px",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "8px",
                  }}
                >
                  검색어
                </div>
                <input
                  value={executeModal.query}
                  onChange={(e) =>
                    setExecuteModal((prev) => ({
                      ...prev,
                      query: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid #d1d5db",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "8px",
                  }}
                >
                  받는 이메일
                </div>
                <input
                  value={executeModal.to}
                  onChange={(e) =>
                    setExecuteModal((prev) => ({
                      ...prev,
                      to: e.target.value,
                    }))
                  }
                  placeholder="비워두면 BRIEFING_TO_EMAIL 사용"
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid #d1d5db",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "8px",
                    }}
                  >
                    템플릿
                  </div>
                  <select
                    value={executeModal.templateType}
                    onChange={(e) =>
                      setExecuteModal((prev) => ({
                        ...prev,
                        templateType:
                          e.target.value === "PRACTICAL"
                            ? "PRACTICAL"
                            : "EXECUTIVE",
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <option value="EXECUTIVE">경영진용 요약형</option>
                    <option value="PRACTICAL">실무자용 상세형</option>
                  </select>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "8px",
                    }}
                  >
                    카테고리
                  </div>
                  <input
                    value={executeModal.category}
                    onChange={(e) =>
                      setExecuteModal((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    placeholder="예: AI / 물류 / 반도체"
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #d1d5db",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#334155",
                      marginBottom: "8px",
                    }}
                  >
                    실행 모드
                  </div>
                  <select
                    value={executeModal.deliveryMode}
                    onChange={(e) =>
                      setExecuteModal((prev) => ({
                        ...prev,
                        deliveryMode:
                          e.target.value === "DRAFT" ? "DRAFT" : "SEND",
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #d1d5db",
                    }}
                  >
                    <option value="SEND">즉시 발송</option>
                    <option value="DRAFT">초안 생성</option>
                  </select>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "20px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={closeExecuteModal}
                disabled={actionLoading}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                취소
              </button>

              <button
                onClick={handleExecuteBriefing}
                disabled={actionLoading || !executeModal.query.trim()}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#16a34a",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {actionLoading ? "실행 중..." : "원클릭 브리핑 실행"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
