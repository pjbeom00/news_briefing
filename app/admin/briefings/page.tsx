// app/admin/briefings/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";

type BriefingListItem = {
  id: number;
  query: string;
  summary: string;
  categoryTag: string | null;
  sentTo: string | null;
  sentAt: string | null;
  scheduledDate: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  newsCount: number;
  topTitles: string[];
};

type BriefingDetailItem = {
  id: number;
  rankOrder: number;
  news: {
    id: number;
    title: string;
    link: string;
    snippet: string | null;
    summary: string | null;
    pubDate: string | null;
    sourceQuery: string | null;
    createdAt: string;
  };
};

type BriefingDetail = {
  id: number;
  query: string;
  summary: string;
  categoryTag: string | null;
  sentTo: string | null;
  sentAt: string | null;
  scheduledDate: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  items: BriefingDetailItem[];
};

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "SENT":
      return "#16a34a";
    case "FAILED":
      return "#dc2626";
    case "PENDING":
      return "#d97706";
    default:
      return "#475569";
  }
}

export default function AdminBriefingsPage() {
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [resending, setResending] = useState(false);

  const [list, setList] = useState<BriefingListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BriefingDetail | null>(null);
  const [message, setMessage] = useState("");

  async function loadList() {
    setLoadingList(true);
    setMessage("");

    try {
      const response = await fetch("/api/briefings?limit=50", {
        cache: "no-store",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "브리핑 목록 조회에 실패했습니다.");
      }

      const rows = Array.isArray(json?.data) ? json.data : [];
      setList(rows);

      if (!selectedId && rows.length > 0) {
        setSelectedId(rows[0].id);
      }
    } catch (error: any) {
      setMessage(error?.message || "브리핑 목록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDetail(id: number) {
    setLoadingDetail(true);
    setMessage("");

    try {
      const response = await fetch(`/api/briefings/${id}`, {
        cache: "no-store",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "브리핑 상세 조회에 실패했습니다.");
      }

      setDetail(json.data || null);
    } catch (error: any) {
      setMessage(error?.message || "브리핑 상세 조회 중 오류가 발생했습니다.");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleResend() {
    if (!selectedId) return;

    setResending(true);
    setMessage("");

    try {
      const response = await fetch(`/api/briefings/${selectedId}/resend`, {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || json?.reason || "브리핑 재발송에 실패했습니다.");
      }

      setMessage(`브리핑 ${selectedId} 재발송 완료`);
      await loadList();
      await loadDetail(selectedId);
    } catch (error: any) {
      setMessage(error?.message || "브리핑 재발송 중 오류가 발생했습니다.");
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
  }, [selectedId]);

  const selectedSummary = useMemo(() => {
    return detail?.summary || "";
  }, [detail]);

  return (
    <main
      style={{
        padding: 24,
        background: "#f8fafc",
        minHeight: "100vh",
        fontFamily:
          "Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              브리핑 관리자
            </h1>
            <div style={{ marginTop: 6, color: "#64748b", fontSize: 14 }}>
              브리핑 이력 조회, 상세 확인, 재발송
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={loadList}
              disabled={loadingList}
              style={{
                border: "none",
                background: "#0f172a",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 16px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {loadingList ? "새로고침 중..." : "목록 새로고침"}
            </button>

            <button
              onClick={handleResend}
              disabled={!selectedId || resending}
              style={{
                border: "none",
                background: "#2563eb",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 16px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {resending ? "재발송 중..." : "선택 브리핑 재발송"}
            </button>
          </div>
        </div>

        {message ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 10,
              background: "#e0f2fe",
              color: "#0f172a",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "420px 1fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          <section
            style={{
              background: "#ffffff",
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              padding: 16,
              maxHeight: "calc(100vh - 180px)",
              overflow: "auto",
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
                marginBottom: 14,
              }}
            >
              브리핑 이력
            </div>

            {loadingList && list.length === 0 ? (
              <div style={{ color: "#64748b" }}>목록 불러오는 중...</div>
            ) : null}

            {!loadingList && list.length === 0 ? (
              <div style={{ color: "#64748b" }}>브리핑 이력이 없습니다.</div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {list.map((item) => {
                const selected = item.id === selectedId;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      textAlign: "left",
                      border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      background: selected ? "#eff6ff" : "#ffffff",
                      borderRadius: 14,
                      padding: 14,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        #{item.id}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#fff",
                          background: getStatusColor(item.status),
                          borderRadius: 999,
                          padding: "4px 10px",
                        }}
                      >
                        {item.status}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#475569",
                        lineHeight: 1.7,
                        marginBottom: 8,
                      }}
                    >
                      {formatDate(item.scheduledDate || item.createdAt)}
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#111827",
                        lineHeight: 1.6,
                        marginBottom: 8,
                      }}
                    >
                      {item.summary}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.6,
                        marginBottom: 8,
                      }}
                    >
                      받는 사람: {item.sentTo || "-"}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.6,
                      }}
                    >
                      기사 수: {item.newsCount}
                    </div>

                    {item.errorMessage ? (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          color: "#dc2626",
                          lineHeight: 1.6,
                        }}
                      >
                        오류: {item.errorMessage}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section
            style={{
              background: "#ffffff",
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              padding: 20,
              minHeight: 500,
            }}
          >
            {loadingDetail ? (
              <div style={{ color: "#64748b" }}>상세 불러오는 중...</div>
            ) : null}

            {!loadingDetail && !detail ? (
              <div style={{ color: "#64748b" }}>브리핑을 선택하세요.</div>
            ) : null}

            {detail ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 800,
                        color: "#0f172a",
                        marginBottom: 8,
                      }}
                    >
                      브리핑 #{detail.id}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>
                      생성일: {formatDate(detail.createdAt)}
                      <br />
                      발송일: {formatDate(detail.sentAt)}
                      <br />
                      예약일: {formatDate(detail.scheduledDate)}
                      <br />
                      받는 사람: {detail.sentTo || "-"}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#fff",
                      background: getStatusColor(detail.status),
                      borderRadius: 999,
                      padding: "6px 12px",
                    }}
                  >
                    {detail.status}
                  </div>
                </div>

                <div
                  style={{
                    marginBottom: 18,
                    padding: 16,
                    borderRadius: 14,
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: 8,
                    }}
                  >
                    검색어
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: "#1e293b" }}>
                    {detail.query}
                  </div>
                </div>

                <div
                  style={{
                    marginBottom: 18,
                    padding: 16,
                    borderRadius: 14,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: 8,
                    }}
                  >
                    브리핑 요약
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: "#1e293b" }}>
                    {selectedSummary}
                  </div>
                </div>

                {detail.errorMessage ? (
                  <div
                    style={{
                      marginBottom: 18,
                      padding: 16,
                      borderRadius: 14,
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      color: "#991b1b",
                      fontSize: 14,
                      lineHeight: 1.8,
                    }}
                  >
                    오류: {detail.errorMessage}
                  </div>
                ) : null}

                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: 14,
                  }}
                >
                  기사 목록
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {detail.items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 14,
                        padding: 16,
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-block",
                          marginBottom: 10,
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#fff",
                          background: "#2563eb",
                          borderRadius: 999,
                          padding: "4px 10px",
                        }}
                      >
                        TOP {item.rankOrder}
                      </div>

                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#111827",
                          lineHeight: 1.6,
                          marginBottom: 8,
                        }}
                      >
                        <a
                          href={item.news.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#111827", textDecoration: "none" }}
                        >
                          {item.news.title}
                        </a>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          lineHeight: 1.7,
                          marginBottom: 8,
                        }}
                      >
                        작성일: {formatDate(item.news.createdAt)}
                        <br />
                        소스 키워드: {item.news.sourceQuery || "-"}
                      </div>

                      <div
                        style={{
                          fontSize: 14,
                          color: "#334155",
                          lineHeight: 1.8,
                          marginBottom: 8,
                        }}
                      >
                        {item.news.summary || item.news.snippet || "-"}
                      </div>

                      {item.news.snippet ? (
                        <details>
                          <summary
                            style={{
                              cursor: "pointer",
                              color: "#2563eb",
                              fontWeight: 700,
                              fontSize: 13,
                            }}
                          >
                            원문 스니펫 보기
                          </summary>
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 13,
                              color: "#475569",
                              lineHeight: 1.8,
                            }}
                          >
                            {item.news.snippet}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
