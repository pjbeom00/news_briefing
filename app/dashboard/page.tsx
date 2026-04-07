// app/dashboasrd/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DashboardCardData = {
  todaySentCount: number;
  todayFailedCount: number;
  weekBriefingCount: number;
  weekSuccessRate: number;
  recentSavedQueryCount: number;
  totalRecentBriefingCount: number;
};

type QueryStat = {
  query: string;
  count: number;
  sentCount: number;
};

type SavedQueryRow = {
  id: number;
  name: string;
  query: string;
  category: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

type BriefingRow = {
  id: number;
  query: string;
  summary: string;
  categoryTag: string | null;
  sentTo: string | null;
  sentAt: string | null;
  status: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type DashboardResponse = {
  generatedAt: string;
  cards: DashboardCardData;
  templateStats: {
    executive: number;
    practical: number;
  };
  topQueries: QueryStat[];
  resendCandidates: QueryStat[];
  recentSavedQueries: SavedQueryRow[];
  recentBriefings: BriefingRow[];
  todayBriefings: Array<{
    id: number;
    query: string;
    status: string | null;
    categoryTag: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
  weekBriefings: Array<{
    id: number;
    query: string;
    status: string | null;
    categoryTag: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
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

function normalizeTemplateType(categoryTag?: string | null) {
  if (String(categoryTag || "").includes("PRACTICAL")) return "실무형";
  return "경영진용";
}

function StatusBadge({ status }: { status?: string | null }) {
  const value = String(status || "UNKNOWN").toUpperCase();

  let background = "#e5e7eb";
  let color = "#334155";
  let label = value;

  if (value === "SENT") {
    background = "#dcfce7";
    color = "#166534";
    label = "발송 완료";
  } else if (value === "FAILED") {
    background = "#fee2e2";
    color = "#b91c1c";
    label = "실패";
  } else if (value === "PENDING") {
    background = "#fef3c7";
    color = "#92400e";
    label = "대기";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: "999px",
        background,
        color,
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {label}
    </span>
  );
}

function MetricCard(props: {
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
        padding: "20px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          color: "#64748b",
          fontWeight: 700,
          marginBottom: "10px",
        }}
      >
        {props.title}
      </div>
      <div
        style={{
          fontSize: "32px",
          fontWeight: 800,
          color: "#0f172a",
          marginBottom: "8px",
        }}
      >
        {props.value}
      </div>
      <div
        style={{
          fontSize: "13px",
          color: "#475569",
          lineHeight: 1.6,
        }}
      >
        {props.description}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cards = useMemo(() => {
    return (
      data?.cards || {
        todaySentCount: 0,
        todayFailedCount: 0,
        weekBriefingCount: 0,
        weekSuccessRate: 0,
        recentSavedQueryCount: 0,
        totalRecentBriefingCount: 0,
      }
    );
  }, [data]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dashboard");
      const parsed = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((parsed as any).error || "대시보드 조회 실패");
      }

      setData(parsed as DashboardResponse);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "대시보드 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
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
          <h1 style={{ marginBottom: "8px" }}>브리핑 대시보드</h1>
          <p style={{ marginTop: 0, color: "#475569", lineHeight: 1.7 }}>
            발송 현황, 템플릿 사용 추이, 자주 쓰는 검색어, 최근 브리핑 흐름을 빠르게 보는 화면입니다.
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
            href="/"
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
            메인 화면
          </Link>

          <Link
            href="/news"
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
            뉴스 브리핑
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
            onClick={loadDashboard}
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
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: "14px",
          marginBottom: "20px",
        }}
      >
        <MetricCard
          title="오늘 발송 완료"
          value={cards.todaySentCount}
          description="금일 생성된 브리핑 중 정상 발송 건수"
        />
        <MetricCard
          title="오늘 실패"
          value={cards.todayFailedCount}
          description="금일 생성된 브리핑 중 실패 건수"
        />
        <MetricCard
          title="최근 7일 브리핑"
          value={cards.weekBriefingCount}
          description="최근 일주일 기준 생성된 브리핑 수"
        />
        <MetricCard
          title="최근 7일 성공률"
          value={`${cards.weekSuccessRate}%`}
          description="최근 7일 브리핑 발송 성공 비율"
        />
        <MetricCard
          title="최근 저장 키워드"
          value={cards.recentSavedQueryCount}
          description="최근 30일 기준 저장된 검색어 수"
        />
        <MetricCard
          title="최근 브리핑 누적"
          value={cards.totalRecentBriefingCount}
          description="최근 30일 브리핑 데이터 수"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "20px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "14px" }}>상위 검색어</h2>

          {!data?.topQueries?.length ? (
            <div style={{ color: "#64748b" }}>표시할 데이터가 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {data.topQueries.map((item, index) => (
                <div
                  key={`${item.query}-${index}`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#0f172a",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.query}
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        color: "#1d4ed8",
                        background: "#dbeafe",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.count}회
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      color: "#475569",
                    }}
                  >
                    발송 완료 {item.sentCount}회
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "20px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "14px" }}>템플릿 사용 비중</h2>

          <div
            style={{
              display: "grid",
              gap: "12px",
            }}
          >
            <div
              style={{
                padding: "16px",
                borderRadius: "14px",
                border: "1px solid #dbeafe",
                background: "#eff6ff",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "#1d4ed8",
                  fontWeight: 800,
                  marginBottom: "8px",
                }}
              >
                경영진용 요약형
              </div>
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {data?.templateStats.executive || 0}
              </div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "14px",
                border: "1px solid #ddd6fe",
                background: "#f5f3ff",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "#6d28d9",
                  fontWeight: 800,
                  marginBottom: "8px",
                }}
              >
                실무자용 상세형
              </div>
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {data?.templateStats.practical || 0}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "20px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "14px" }}>재발송 후보 검색어</h2>

          {!data?.resendCandidates?.length ? (
            <div style={{ color: "#64748b" }}>표시할 데이터가 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {data.resendCandidates.map((item, index) => (
                <div
                  key={`${item.query}-${index}`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: "6px",
                      wordBreak: "break-word",
                    }}
                  >
                    {item.query}
                  </div>
                  <div style={{ fontSize: "13px", color: "#475569" }}>
                    총 {item.count}건 · 발송 완료 {item.sentCount}건
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "20px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "14px" }}>최근 저장 키워드</h2>

          {!data?.recentSavedQueries?.length ? (
            <div style={{ color: "#64748b" }}>표시할 데이터가 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {data.recentSavedQueries.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#0f172a",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.name}
                    </div>

                    {item.isFavorite && (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "#92400e",
                          background: "#fef3c7",
                          padding: "4px 8px",
                          borderRadius: "999px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        즐겨찾기
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "13px",
                      color: "#475569",
                      lineHeight: 1.7,
                      wordBreak: "break-word",
                      marginBottom: "6px",
                    }}
                  >
                    {item.query}
                  </div>

                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {item.category || "기타"} ·{" "}
                    {new Date(item.updatedAt).toLocaleString("ko-KR")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          <h2 style={{ margin: 0 }}>최근 브리핑</h2>
          <Link
            href="/admin/briefings"
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "#111827",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            관리자에서 자세히 보기
          </Link>
        </div>

        {!data?.recentBriefings?.length ? (
          <div style={{ color: "#64748b" }}>표시할 데이터가 없습니다.</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {data.recentBriefings.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#0f172a",
                        wordBreak: "break-word",
                        marginBottom: "6px",
                      }}
                    >
                      {item.query}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <StatusBadge status={item.status} />

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "4px 8px",
                          borderRadius: "999px",
                          background:
                            normalizeTemplateType(item.categoryTag) === "실무형"
                              ? "#ede9fe"
                              : "#dbeafe",
                          color:
                            normalizeTemplateType(item.categoryTag) === "실무형"
                              ? "#6d28d9"
                              : "#1d4ed8",
                        }}
                      >
                        {normalizeTemplateType(item.categoryTag)}
                      </span>

                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {new Date(item.createdAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "13px",
                    color: "#334155",
                    lineHeight: 1.7,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {item.summary}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
