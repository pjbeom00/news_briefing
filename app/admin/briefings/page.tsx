// app/admin/briefings/page.tsx
// (2026-04-03) : 관리자 화면 UX 정리

"use client";

import { useEffect, useMemo, useState } from "react";

type BriefingTemplateType = "EXECUTIVE" | "PRACTICAL";

type StructuredSummary = {
  trend: string;
  keyPoints: string[];
  companyInsight: string;
  comment: string;
};

type BriefingNewsItem = {
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
};

type BriefingRow = {
  id: number;
  query: string;
  summary: string;
  categoryTag: string | null;
  sentTo: string | null;
  sentAt: string | null;
  scheduledDate?: string | null;
  status?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  structured?: StructuredSummary | null;
  templateType?: BriefingTemplateType;
  items: BriefingNewsItem[];
};

type ResendResponse = {
  ok: boolean;
  status: string;
  briefingId: number;
  sentTo?: string;
  reason?: string;
  newsCount?: number;
};

const TEMPLATE_OPTIONS: Array<{
  value: BriefingTemplateType;
  label: string;
  description: string;
}> = [
  {
    value: "EXECUTIVE",
    label: "경영진용 요약형",
    description: "핵심 흐름과 시사점 중심",
  },
  {
    value: "PRACTICAL",
    label: "실무자용 상세형",
    description: "기사별 포인트와 실행 관점 강화",
  },
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

function inferTemplateType(row: BriefingRow): BriefingTemplateType {
  if (row.templateType) return row.templateType;
  if (row.categoryTag?.includes("PRACTICAL")) return "PRACTICAL";
  return "EXECUTIVE";
}

function parseStructuredSummaryFromText(text: string): StructuredSummary {
  const raw = String(text || "").trim();

  if (!raw) {
    return {
      trend: "",
      keyPoints: [],
      companyInsight: "",
      comment: "",
    };
  }

  const lines = raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let trend = "";
  let companyInsight = "";
  let comment = "";
  const keyPoints: string[] = [];

  for (const line of lines) {
    if (line.startsWith("오늘의 핵심 동향")) {
      trend = line.replace(/^오늘의 핵심 동향[:：]?\s*/u, "").trim();
      continue;
    }

    if (line.startsWith("핵심 포인트")) {
      const cleaned = line.replace(/^핵심 포인트[:：]?\s*/u, "").trim();
      if (cleaned) keyPoints.push(cleaned);
      continue;
    }

    if (line.startsWith("- ")) {
      keyPoints.push(line.replace(/^- /, "").trim());
      continue;
    }

    if (line.startsWith("기업 관점")) {
      companyInsight = line.replace(/^기업 관점[:：]?\s*/u, "").trim();
      continue;
    }

    if (line.startsWith("마지막 코멘트")) {
      comment = line.replace(/^마지막 코멘트[:：]?\s*/u, "").trim();
      continue;
    }
  }

  if (!trend) {
    trend = lines[0] || "";
  }

  return {
    trend,
    keyPoints: keyPoints.slice(0, 5),
    companyInsight,
    comment,
  };
}

function SummarySectionCard(props: {
  title: string;
  background: string;
  borderColor: string;
  titleColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: "14px",
        background: props.background,
        border: `1px solid ${props.borderColor}`,
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: 800,
          color: props.titleColor,
          marginBottom: "10px",
        }}
      >
        {props.title}
      </div>
      {props.children}
    </div>
  );
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

export default function AdminBriefingsPage() {
  const [briefings, setBriefings] = useState<BriefingRow[]>([]);
  const [selectedBriefing, setSelectedBriefing] = useState<BriefingRow | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [templateFilter, setTemplateFilter] = useState("ALL");
  const [templateType, setTemplateType] =
    useState<BriefingTemplateType>("EXECUTIVE");

  const [previewItem, setPreviewItem] = useState<BriefingNewsItem["news"] | null>(
    null
  );

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filteredBriefings = useMemo(() => {
    const normalizedKeyword = normalizeText(keyword);

    return briefings.filter((item) => {
      const inferredTemplate = inferTemplateType(item);
      const haystack = normalizeText(
        `${item.query} ${item.summary} ${item.categoryTag || ""} ${item.sentTo || ""}`
      );

      const keywordMatched = !normalizedKeyword || haystack.includes(normalizedKeyword);
      const statusMatched =
        statusFilter === "ALL" ||
        String(item.status || "UNKNOWN").toUpperCase() === statusFilter;
      const templateMatched =
        templateFilter === "ALL" || inferredTemplate === templateFilter;

      return keywordMatched && statusMatched && templateMatched;
    });
  }, [briefings, keyword, statusFilter, templateFilter]);

  const loadBriefings = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/briefings");
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "브리핑 목록 조회 실패");
      }

      const rows = (((data as any).data || []) as BriefingRow[]).map((row) => ({
        ...row,
        structured:
          row.structured || parseStructuredSummaryFromText(row.summary),
        templateType: inferTemplateType(row),
        items: Array.isArray(row.items) ? row.items : [],
      }));

      setBriefings(rows);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "브리핑 목록 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const loadBriefingDetail = async (id: number) => {
    try {
      setDetailLoading(true);
      setError("");

      const res = await fetch(`/api/briefings/${id}`);
      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "브리핑 상세 조회 실패");
      }

      const row = (((data as any).data || data) as BriefingRow) || null;
      const normalized = row
        ? {
            ...row,
            structured:
              row.structured || parseStructuredSummaryFromText(row.summary),
            templateType: inferTemplateType(row),
            items: Array.isArray(row.items) ? row.items : [],
          }
        : null;

      setSelectedBriefing(normalized);
      setSelectedId(id);
      if (normalized?.templateType) {
        setTemplateType(normalized.templateType);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "브리핑 상세 조회 중 오류가 발생했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResend = async () => {
    if (!selectedBriefing) return;

    try {
      setResendingId(selectedBriefing.id);
      setError("");
      setNotice("");

      const res = await fetch(`/api/briefings/${selectedBriefing.id}/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateType,
        }),
      });

      const data = (await parseJsonSafe(res)) as ResendResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || data.reason || "재발송 실패");
      }

      setNotice(
        `브리핑이 재발송되었습니다. ${
          data.sentTo ? `수신자: ${data.sentTo}` : ""
        }`
      );

      await loadBriefings();
      await loadBriefingDetail(selectedBriefing.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "재발송 중 오류가 발생했습니다.");
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = window.confirm("이 브리핑을 삭제할까요?");
    if (!confirmed) return;

    try {
      setDeletingId(id);
      setError("");
      setNotice("");

      const res = await fetch(`/api/briefings/${id}`, {
        method: "DELETE",
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "브리핑 삭제 실패");
      }

      if (selectedId === id) {
        setSelectedId(null);
        setSelectedBriefing(null);
      }

      setNotice("브리핑이 삭제되었습니다.");
      await loadBriefings();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "브리핑 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadBriefings();
  }, []);

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
        <h1 style={{ marginBottom: "8px" }}>브리핑 관리자</h1>
        <p style={{ marginTop: 0, color: "#475569", lineHeight: 1.7 }}>
          히스토리 검색, 상태 필터, 템플릿 전환 재발송, 구조화 요약 확인, 기사 미리보기까지 반영된 관리자 화면입니다.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "420px minmax(0, 1fr)",
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
              maxHeight: "calc(100vh - 32px)",
              overflow: "auto",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="브리핑 검색"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                }}
              >
                <option value="ALL">전체 상태</option>
                <option value="SENT">발송 완료</option>
                <option value="FAILED">실패</option>
                <option value="PENDING">대기</option>
              </select>

              <select
                value={templateFilter}
                onChange={(e) => setTemplateFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                }}
              >
                <option value="ALL">전체 템플릿</option>
                <option value="EXECUTIVE">경영진용</option>
                <option value="PRACTICAL">실무형</option>
              </select>
            </div>

            {loading && (
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

            {!loading && filteredBriefings.length === 0 && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  color: "#64748b",
                  fontSize: "14px",
                }}
              >
                검색 결과가 없습니다.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filteredBriefings.map((item) => {
                const isSelected = selectedId === item.id;
                const template = inferTemplateType(item);

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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          marginBottom: "6px",
                        }}
                      >
                        <div style={{ fontWeight: 800, wordBreak: "break-word" }}>
                          {item.query}
                        </div>
                        <StatusBadge status={item.status} />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: "999px",
                            background: template === "PRACTICAL" ? "#ede9fe" : "#dbeafe",
                            color: template === "PRACTICAL" ? "#6d28d9" : "#1d4ed8",
                          }}
                        >
                          {template === "PRACTICAL" ? "실무형" : "경영진용"}
                        </span>

                        <span
                          style={{
                            fontSize: "12px",
                            color: "#64748b",
                          }}
                        >
                          {new Date(item.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </div>

                      <div
                        style={{
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
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
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
                        {deletingId === item.id ? "삭제 중..." : "삭제"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <section style={{ minWidth: 0 }}>
            {error && (
              <pre
                style={{
                  color: "red",
                  marginTop: 0,
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
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  background: "#fffbea",
                  color: "#92400e",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #fde68a",
                  marginBottom: "16px",
                }}
              >
                {notice}
              </div>
            )}

            {!selectedBriefing && !detailLoading && (
              <div
                style={{
                  padding: "28px",
                  borderRadius: "16px",
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#64748b",
                }}
              >
                왼쪽에서 브리핑을 선택하세요.
              </div>
            )}

            {detailLoading && (
              <div
                style={{
                  padding: "28px",
                  borderRadius: "16px",
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#64748b",
                }}
              >
                브리핑 상세 불러오는 중...
              </div>
            )}

            {selectedBriefing && (
              <div
                style={{
                  display: "grid",
                  gap: "16px",
                }}
              >
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
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <h2
                        style={{
                          marginTop: 0,
                          marginBottom: "8px",
                          wordBreak: "break-word",
                        }}
                      >
                        {selectedBriefing.query}
                      </h2>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <StatusBadge status={selectedBriefing.status} />

                        <span
                          style={{
                            fontSize: "12px",
                            color: "#64748b",
                          }}
                        >
                          {new Date(selectedBriefing.createdAt).toLocaleString("ko-KR")}
                        </span>

                        {selectedBriefing.sentTo && (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#166534",
                            }}
                          >
                            발송: {selectedBriefing.sentTo}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        minWidth: "280px",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#334155",
                        }}
                      >
                        재발송 템플릿
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {TEMPLATE_OPTIONS.map((item) => (
                          <button
                            key={item.value}
                            onClick={() => setTemplateType(item.value)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "10px",
                              border:
                                templateType === item.value
                                  ? "1px solid #2563eb"
                                  : "1px solid #cbd5e1",
                              background:
                                templateType === item.value ? "#eff6ff" : "#ffffff",
                              color:
                                templateType === item.value ? "#1d4ed8" : "#334155",
                              fontWeight: 700,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ fontSize: "13px" }}>{item.label}</div>
                            <div
                              style={{
                                fontSize: "11px",
                                marginTop: "4px",
                                color:
                                  templateType === item.value
                                    ? "#1d4ed8"
                                    : "#64748b",
                              }}
                            >
                              {item.description}
                            </div>
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={handleResend}
                        disabled={resendingId === selectedBriefing.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "10px",
                          border: "none",
                          background: "#2563eb",
                          color: "#fff",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {resendingId === selectedBriefing.id
                          ? "재발송 중..."
                          : "선택한 템플릿으로 재발송"}
                      </button>
                    </div>
                  </div>

                  {selectedBriefing.errorMessage && (
                    <div
                      style={{
                        marginTop: "14px",
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#fff5f5",
                        border: "1px solid #fecaca",
                        color: "#b91c1c",
                        fontSize: "13px",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {selectedBriefing.errorMessage}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <SummarySectionCard
                    title="오늘의 핵심 동향"
                    background="#e0f2fe"
                    borderColor="#7dd3fc"
                    titleColor="#0f172a"
                  >
                    <div style={{ fontSize: "14px", lineHeight: 1.8, color: "#1f2937" }}>
                      {selectedBriefing.structured?.trend || ""}
                    </div>
                  </SummarySectionCard>

                  <SummarySectionCard
                    title="핵심 포인트"
                    background="#ffffff"
                    borderColor="#dbeafe"
                    titleColor="#2563eb"
                  >
                    {selectedBriefing.structured?.keyPoints?.length ? (
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {selectedBriefing.structured.keyPoints.map((point, index) => (
                          <li
                            key={`${index}-${point}`}
                            style={{
                              marginBottom: "8px",
                              fontSize: "14px",
                              lineHeight: 1.8,
                              color: "#1f2937",
                            }}
                          >
                            {point}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: "14px", color: "#64748b" }}>
                        내용이 없습니다.
                      </div>
                    )}
                  </SummarySectionCard>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <SummarySectionCard
                      title="기업 관점"
                      background="#f8fafc"
                      borderColor="#e2e8f0"
                      titleColor="#0f172a"
                    >
                      <div style={{ fontSize: "14px", lineHeight: 1.8, color: "#334155" }}>
                        {selectedBriefing.structured?.companyInsight || ""}
                      </div>
                    </SummarySectionCard>

                    <SummarySectionCard
                      title="마지막 코멘트"
                      background="#fff7ed"
                      borderColor="#fdba74"
                      titleColor="#9a3412"
                    >
                      <div style={{ fontSize: "14px", lineHeight: 1.8, color: "#7c2d12" }}>
                        {selectedBriefing.structured?.comment || ""}
                      </div>
                    </SummarySectionCard>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "16px",
                    padding: "20px",
                    background: "#fff",
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: "14px" }}>기사 목록</h3>

                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    {selectedBriefing.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: "12px",
                          padding: "14px 16px",
                          background: item.rankOrder <= 3 ? "#f8fbff" : "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                background:
                                  item.rankOrder <= 3 ? "#2563eb" : "#e5e7eb",
                                color: item.rankOrder <= 3 ? "#fff" : "#111827",
                                fontSize: "12px",
                                fontWeight: 800,
                                marginBottom: "10px",
                              }}
                            >
                              {item.rankOrder <= 3
                                ? `TOP ${item.rankOrder}`
                                : `${item.rankOrder}위`}
                            </div>

                            <div
                              style={{
                                fontSize: "15px",
                                fontWeight: 800,
                                lineHeight: 1.6,
                                wordBreak: "break-word",
                                marginBottom: "8px",
                              }}
                            >
                              <a
                                href={item.news.link}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: "#111827",
                                  textDecoration: "none",
                                }}
                              >
                                {item.news.title}
                              </a>
                            </div>

                            <div
                              style={{
                                fontSize: "13px",
                                color: "#475569",
                                lineHeight: 1.7,
                              }}
                            >
                              {item.news.snippet || item.news.summary || "요약 없음"}
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
                              onClick={() => setPreviewItem(item.news)}
                              style={{
                                padding: "8px 12px",
                                borderRadius: "8px",
                                border: "1px solid #d1d5db",
                                background: "#fff",
                                color: "#111827",
                                cursor: "pointer",
                                fontSize: "12px",
                              }}
                            >
                              미리보기
                            </button>

                            <a
                              href={item.news.link}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                padding: "8px 12px",
                                borderRadius: "8px",
                                background: "#111827",
                                color: "#fff",
                                textDecoration: "none",
                                fontSize: "12px",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                            >
                              원문 열기
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {previewItem && (
        <div
          onClick={() => setPreviewItem(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
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
              maxWidth: "760px",
              background: "#ffffff",
              borderRadius: "18px",
              padding: "24px",
              boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
              maxHeight: "85vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "14px",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 800,
                    color: "#0f172a",
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}
                >
                  {previewItem.title}
                </div>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: "#64748b",
                  }}
                >
                  {previewItem.pubDate || ""}
                </div>
              </div>

              <button
                onClick={() => setPreviewItem(null)}
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

            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: "15px",
                lineHeight: 1.9,
                color: "#334155",
                whiteSpace: "pre-wrap",
              }}
            >
              {previewItem.snippet || previewItem.summary || "미리보기 가능한 요약 내용이 없습니다."}
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "16px",
                flexWrap: "wrap",
              }}
            >
              <a
                href={previewItem.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "#111827",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                원문 열기
              </a>

              <button
                onClick={() => setPreviewItem(null)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
