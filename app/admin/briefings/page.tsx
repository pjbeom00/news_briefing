// app/admin/briefings/page.tsx
// (2026-04-03) : 관리자 화면 UX 정리
// (2026-04-06) File: app/admin/briefings/page.tsx

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

type SummarySections = {
  trend: string[];
  keyPoints: string[];
  companyInsight: string[];
  comment: string[];
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

function splitSummaryToParagraphs(text: string) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/([.!?])\s+/g, "$1\n")
    .replace(/다\.\s+/g, "다.\n")
    .trim();

  return normalized
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStructuredSummary(text: string): SummarySections {
  const paragraphs = splitSummaryToParagraphs(text);

  const sections: SummarySections = {
    trend: [],
    keyPoints: [],
    companyInsight: [],
    comment: [],
  };

  let currentSection: keyof SummarySections = "trend";

  for (const paragraph of paragraphs) {
    if (
      paragraph.includes("오늘의 핵심 동향") ||
      paragraph.includes("핵심 동향")
    ) {
      currentSection = "trend";
      sections.trend.push(
        paragraph.replace(/^.*?(오늘의 핵심 동향|핵심 동향)\s*[:-]?\s*/u, "").trim() ||
          paragraph
      );
      continue;
    }

    if (
      paragraph.includes("기사별 핵심 포인트") ||
      paragraph.includes("핵심 포인트")
    ) {
      currentSection = "keyPoints";
      const cleaned = paragraph.replace(
        /^.*?(기사별 핵심 포인트|핵심 포인트)\s*[:-]?\s*/u,
        ""
      ).trim();

      if (cleaned) {
        sections.keyPoints.push(cleaned);
      }
      continue;
    }

    if (
      paragraph.includes("기업 관점 요약") ||
      paragraph.includes("기업 관점")
    ) {
      currentSection = "companyInsight";
      sections.companyInsight.push(
        paragraph.replace(/^.*?(기업 관점 요약|기업 관점)\s*[:-]?\s*/u, "").trim() ||
          paragraph
      );
      continue;
    }

    if (
      paragraph.includes("마지막 코멘트") ||
      paragraph.includes("코멘트")
    ) {
      currentSection = "comment";
      sections.comment.push(
        paragraph.replace(/^.*?(마지막 코멘트|코멘트)\s*[:-]?\s*/u, "").trim() ||
          paragraph
      );
      continue;
    }

    sections[currentSection].push(paragraph);
  }

  if (
    sections.trend.length === 0 &&
    sections.keyPoints.length === 0 &&
    sections.companyInsight.length === 0 &&
    sections.comment.length === 0
  ) {
    return {
      trend: paragraphs.slice(0, 2),
      keyPoints: paragraphs.slice(2, 5),
      companyInsight: paragraphs.slice(5, 7),
      comment: paragraphs.slice(7),
    };
  }

  return sections;
}

function SectionCard(props: {
  title: string;
  accentBg: string;
  accentBorder: string;
  titleColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 16,
        background: props.accentBg,
        border: `1px solid ${props.accentBorder}`,
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: props.titleColor,
          marginBottom: 12,
        }}
      >
        {props.title}
      </div>
      {props.children}
    </div>
  );
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

  const summarySections = useMemo(() => {
    return parseStructuredSummary(detail?.summary || "");
  }, [detail]);

  const highlightedItems = useMemo(() => {
    return detail?.items.slice(0, 3) || [];
  }, [detail]);

  const normalItems = useMemo(() => {
    return detail?.items.slice(3) || [];
  }, [detail]);

  return (
    <main
      style={{
        padding: 24,
        background: "#f8fafc",
        minHeight: "100vh",
        fontFamily: "Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif",
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
                        display: "-webkit-box",
                        WebkitLineClamp: 5,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
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

                <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                  <SectionCard
                    title="오늘의 핵심 동향"
                    accentBg="#e0f2fe"
                    accentBorder="#7dd3fc"
                    titleColor="#0f172a"
                  >
                    {summarySections.trend.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {summarySections.trend.map((paragraph, index) => (
                          <p
                            key={`trend-${index}`}
                            style={{
                              margin: 0,
                              fontSize: 15,
                              lineHeight: 1.9,
                              color: "#1e293b",
                              wordBreak: "keep-all",
                            }}
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, color: "#64748b" }}>내용이 없습니다.</div>
                    )}
                  </SectionCard>

                  <SectionCard
                    title="핵심 포인트"
                    accentBg="#ffffff"
                    accentBorder="#dbeafe"
                    titleColor="#2563eb"
                  >
                    {summarySections.keyPoints.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {summarySections.keyPoints.map((point, index) => (
                          <li
                            key={`point-${index}`}
                            style={{
                              marginBottom: 8,
                              fontSize: 14,
                              lineHeight: 1.9,
                              color: "#1e293b",
                            }}
                          >
                            {point}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: 14, color: "#64748b" }}>내용이 없습니다.</div>
                    )}
                  </SectionCard>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
                    <SectionCard
                      title="기업 관점"
                      accentBg="#f8fafc"
                      accentBorder="#e2e8f0"
                      titleColor="#0f172a"
                    >
                      {summarySections.companyInsight.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {summarySections.companyInsight.map((paragraph, index) => (
                            <p
                              key={`company-${index}`}
                              style={{
                                margin: 0,
                                fontSize: 14,
                                lineHeight: 1.9,
                                color: "#334155",
                              }}
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, color: "#64748b" }}>내용이 없습니다.</div>
                      )}
                    </SectionCard>

                    <SectionCard
                      title="마지막 코멘트"
                      accentBg="#fff7ed"
                      accentBorder="#fdba74"
                      titleColor="#9a3412"
                    >
                      {summarySections.comment.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {summarySections.comment.map((paragraph, index) => (
                            <p
                              key={`comment-${index}`}
                              style={{
                                margin: 0,
                                fontSize: 14,
                                lineHeight: 1.9,
                                color: "#7c2d12",
                              }}
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, color: "#64748b" }}>내용이 없습니다.</div>
                      )}
                    </SectionCard>
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

                {highlightedItems.length > 0 ? (
                  <div style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#2563eb",
                        marginBottom: 12,
                      }}
                    >
                      상위 3개 핵심 기사
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {highlightedItems.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            border: "1px solid #bfdbfe",
                            borderRadius: 16,
                            padding: 18,
                            background: "#eff6ff",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
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
                              fontSize: 17,
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
                              marginBottom: 10,
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
                              lineHeight: 1.9,
                            }}
                          >
                            {item.news.summary || item.news.snippet || "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {normalItems.length > 0 ? (
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#475569",
                        marginBottom: 12,
                      }}
                    >
                      그 외 기사
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {normalItems.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: 14,
                            padding: 14,
                            background: "#ffffff",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: "#64748b",
                              marginBottom: 8,
                            }}
                          >
                            기사 {item.rankOrder}
                          </div>

                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color: "#111827",
                              lineHeight: 1.6,
                              marginBottom: 6,
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
                            }}
                          >
                            소스 키워드: {item.news.sourceQuery || "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
