// app/dashboard/queries/page.tsx

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
  savedQueryId: number | null;
  savedQueryName: string | null;
  savedQueryCategory: string | null;
  savedQueryFavorite: boolean;
};

type SortKey =
  | "totalBriefings"
  | "sentCount"
  | "successRate"
  | "lastUsedAt"
  | "templateExecutiveCount"
  | "templatePracticalCount";

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

export default function QueryPerformancePage() {
  const [rows, setRows] = useState<QueryPerformanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [keyword, setKeyword] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("totalBriefings");

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
          new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
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

    return {
      totalQueries,
      totalBriefings,
      totalSent,
      averageSuccessRate,
    };
  }, [filteredRows]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dashboard/queries");
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "검색어 성과 조회 실패");
      }

      setRows((((data as any).data || []) as QueryPerformanceRow[]) || []);
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

  return (
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
            어떤 검색어가 실제로 브리핑 생성과 발송으로 이어졌는지 확인하는 화면입니다.
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
            href="/admin/briefings"
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
            브리핑 관리자
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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

        {loading && (
          <div style={{ color: "#64748b" }}>불러오는 중...</div>
        )}

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
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: "10px",
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
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    경영진용
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
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
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    실무형
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
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
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    대기
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
                    {row.pendingCount}
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
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    저장 카테고리
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                    {row.savedQueryCategory || "-"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
