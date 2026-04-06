// File: app/dashboard/executions/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ExecutionRow = {
  id: number;
  query: string;
  toEmail: string | null;
  templateType: string;
  deliveryMode: string;
  category: string | null;
  status: string;
  searchedCount: number;
  finalCount: number;
  briefingId: number | null;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  gmailDraftId: string | null;
  adminDetailUrl: string | null;
  adminListUrl: string | null;
  gmailDraftsUrl: string | null;
  errorMessage: string | null;
  failureReason: string;
  createdAt: string;
  updatedAt: string;
};

type Summary = {
  total: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  draftCount: number;
  sendCount: number;
};

type DailyTrendItem = {
  day: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
};

type FailureReasonItem = {
  reason: string;
  count: number;
};

type ResponseShape = {
  summary: Summary;
  charts: {
    dailyTrend: DailyTrendItem[];
    failureReasons: FailureReasonItem[];
  };
  data: ExecutionRow[];
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

function StatusBadge({ status }: { status: string }) {
  const value = String(status || "UNKNOWN").toUpperCase();

  let background = "#e5e7eb";
  let color = "#334155";
  let label = value;

  if (value === "SUCCESS") {
    background = "#dcfce7";
    color = "#166534";
    label = "성공";
  } else if (value === "FAILED") {
    background = "#fee2e2";
    color = "#b91c1c";
    label = "실패";
  } else if (value === "RUNNING") {
    background = "#fef3c7";
    color = "#92400e";
    label = "실행 중";
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

function ModeBadge({ mode }: { mode: string }) {
  const value = String(mode || "SEND").toUpperCase();
  const isDraft = value === "DRAFT";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: "999px",
        background: isDraft ? "#ede9fe" : "#dbeafe",
        color: isDraft ? "#6d28d9" : "#1d4ed8",
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {isDraft ? "초안 생성" : "즉시 발송"}
    </span>
  );
}

function SummaryCard(props: {
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

function BarReasonCard(props: {
  title: string;
  items: FailureReasonItem[];
}) {
  const maxValue = Math.max(...props.items.map((item) => item.count), 1);

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
        <div style={{ color: "#64748b" }}>표시할 실패 원인이 없습니다.</div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {props.items.map((item, index) => (
            <div key={`${item.reason}-${index}`}>
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
                  {item.reason}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#475569",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.count}건
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
                    width: `${(item.count / maxValue) * 100}%`,
                    height: "100%",
                    background: "#ef4444",
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

function TrendCard(props: {
  title: string;
  items: DailyTrendItem[];
  valueKey: "total" | "success" | "failed" | "successRate";
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
                <div style={{ fontSize: "12px", color: "#0f172a", fontWeight: 800 }}>
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

export default function ExecutionLogsPage() {
  const [rows, setRows] = useState<ExecutionRow[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    successCount: 0,
    failedCount: 0,
    runningCount: 0,
    draftCount: 0,
    sendCount: 0,
  });
  const [dailyTrend, setDailyTrend] = useState<DailyTrendItem[]>([]);
  const [failureReasons, setFailureReasons] = useState<FailureReasonItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("ALL");
  const [deliveryMode, setDeliveryMode] = useState("ALL");

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((row) => row.id === selectedId) || null;
  }, [rows, selectedId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (status !== "ALL") params.set("status", status);
      if (deliveryMode !== "ALL") params.set("deliveryMode", deliveryMode);

      const res = await fetch(`/api/dashboard/executions?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "원클릭 실행 로그 조회 실패");
      }

      const parsed = data as ResponseShape;
      const nextRows = parsed.data || [];
      const nextSummary = parsed.summary || {
        total: 0,
        successCount: 0,
        failedCount: 0,
        runningCount: 0,
        draftCount: 0,
        sendCount: 0,
      };

      setRows(nextRows);
      setSummary(nextSummary);
      setDailyTrend(parsed.charts?.dailyTrend || []);
      setFailureReasons(parsed.charts?.failureReasons || []);

      if (nextRows.length > 0) {
        setSelectedId((prev) => {
          if (prev && nextRows.some((row) => row.id === prev)) {
            return prev;
          }
          return nextRows[0].id;
        });
      } else {
        setSelectedId(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "원클릭 실행 로그 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [status, deliveryMode]);

  const handleRetry = async () => {
    if (!selectedRow) return;

    try {
      setActionLoading(true);
      setError("");
      setNotice("");

      const res = await fetch(
        `/api/dashboard/executions/${selectedRow.id}/retry`,
        {
          method: "POST",
        }
      );

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "재실행 중 오류가 발생했습니다.");
      }

      setNotice(
        `재실행 완료
- 원본 로그 ID: ${selectedRow.id}
- 검색어: ${selectedRow.query}
- 실행 결과는 최신 로그에 반영됩니다.`
      );

      await loadData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "재실행 중 오류가 발생했습니다.");
    } finally {
      setActionLoading(false);
    }
  };

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
          <h1 style={{ marginBottom: "8px" }}>원클릭 실행 이력 로그</h1>
          <p style={{ marginTop: 0, color: "#475569", lineHeight: 1.7 }}>
            원클릭 브리핑 실행 결과, 성공률 추이, 실패 원인을 함께 보는 운영 로그 화면입니다.
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
            href="/dashboard/queries"
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
            검색어 성과 분석
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: "14px",
          marginBottom: "20px",
        }}
      >
        <SummaryCard title="전체 실행 수" value={summary.total} description="현재 필터 기준 전체 실행 로그 수" />
        <SummaryCard title="성공" value={summary.successCount} description="정상 완료된 원클릭 실행 수" />
        <SummaryCard title="실패" value={summary.failedCount} description="실패한 원클릭 실행 수" />
        <SummaryCard title="실행 중" value={summary.runningCount} description="아직 완료되지 않은 실행 수" />
        <SummaryCard title="초안 생성" value={summary.draftCount} description="초안 생성 모드 실행 수" />
        <SummaryCard title="즉시 발송" value={summary.sendCount} description="즉시 발송 모드 실행 수" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <TrendCard title="최근 7일 전체 실행 추이" items={dailyTrend} valueKey="total" />
        <TrendCard title="최근 7일 성공 추이" items={dailyTrend} valueKey="success" />
        <TrendCard title="최근 7일 성공률 추이" items={dailyTrend} valueKey="successRate" />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <BarReasonCard title="실패 원인 분석" items={failureReasons} />
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
            gridTemplateColumns: "1.2fr 180px 180px 120px",
            gap: "12px",
          }}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="검색어 / 수신자 / 카테고리 / 오류 메시지 검색"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
              boxSizing: "border-box",
            }}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
            }}
          >
            <option value="ALL">전체 상태</option>
            <option value="SUCCESS">성공</option>
            <option value="FAILED">실패</option>
            <option value="RUNNING">실행 중</option>
          </select>

          <select
            value={deliveryMode}
            onChange={(e) => setDeliveryMode(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
            }}
          >
            <option value="ALL">전체 모드</option>
            <option value="SEND">즉시 발송</option>
            <option value="DRAFT">초안 생성</option>
          </select>

          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "none",
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            조회
          </button>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "440px minmax(0, 1fr)",
          gap: "20px",
        }}
      >
        <aside
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "16px",
            background: "#fff",
            maxHeight: "calc(100vh - 120px)",
            overflow: "auto",
          }}
        >
          {loading && <div style={{ color: "#64748b" }}>불러오는 중...</div>}

          {!loading && rows.length === 0 && (
            <div style={{ color: "#64748b" }}>표시할 실행 로그가 없습니다.</div>
          )}

          <div style={{ display: "grid", gap: "10px" }}>
            {rows.map((row) => {
              const selected = selectedId === row.id;

              return (
                <button
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  style={{
                    textAlign: "left",
                    border: selected ? "2px solid #2563eb" : "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "14px",
                    background: selected ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      alignItems: "flex-start",
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
                      {row.query}
                    </div>
                    <StatusBadge status={row.status} />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <ModeBadge mode={row.deliveryMode} />
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      #{row.id}
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      lineHeight: 1.7,
                    }}
                  >
                    수신자: {row.toEmail || "-"}
                    <br />
                    최종 기사 수: {row.finalCount}
                    <br />
                    실패 분류: {row.status === "FAILED" ? row.failureReason : "-"}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "20px",
            background: "#fff",
          }}
        >
          {!selectedRow ? (
            <div style={{ color: "#64748b" }}>왼쪽에서 실행 로그를 선택하세요.</div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h2
                    style={{
                      marginTop: 0,
                      marginBottom: "8px",
                      wordBreak: "break-word",
                    }}
                  >
                    {selectedRow.query}
                  </h2>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <StatusBadge status={selectedRow.status} />
                    <ModeBadge mode={selectedRow.deliveryMode} />
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      로그 ID: {selectedRow.id}
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      브리핑 ID: {selectedRow.briefingId || "-"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleRetry}
                  disabled={actionLoading}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#16a34a",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {actionLoading ? "재실행 중..." : "재실행"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    수신자
                  </div>
                  <div style={{ fontWeight: 800, color: "#0f172a", wordBreak: "break-word" }}>
                    {selectedRow.toEmail || "-"}
                  </div>
                </div>

                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    템플릿 / 카테고리
                  </div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {selectedRow.templateType} / {selectedRow.category || "-"}
                  </div>
                </div>

                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    검색 기사 수
                  </div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {selectedRow.searchedCount}
                  </div>
                </div>

                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                    최종 기사 수
                  </div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {selectedRow.finalCount}
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: "10px",
                  }}
                >
                  실행 정보
                </div>

                <div
                  style={{
                    fontSize: "13px",
                    color: "#334155",
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  생성일: {new Date(selectedRow.createdAt).toLocaleString("ko-KR")}
                  {"\n"}
                  수정일: {new Date(selectedRow.updatedAt).toLocaleString("ko-KR")}
                  {"\n"}
                  실패 분류: {selectedRow.status === "FAILED" ? selectedRow.failureReason : "-"}
                  {"\n"}
                  Gmail Message ID: {selectedRow.gmailMessageId || "-"}
                  {"\n"}
                  Gmail Thread ID: {selectedRow.gmailThreadId || "-"}
                  {"\n"}
                  Gmail Draft ID: {selectedRow.gmailDraftId || "-"}
                </div>
              </div>

              {selectedRow.errorMessage && (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    background: "#fff5f5",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    fontSize: "13px",
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                    marginBottom: "16px",
                  }}
                >
                  {selectedRow.errorMessage}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                {selectedRow.adminDetailUrl && (
                  <Link
                    href={selectedRow.adminDetailUrl}
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

                {selectedRow.adminListUrl && (
                  <Link
                    href={selectedRow.adminListUrl}
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

                {selectedRow.gmailDraftsUrl && (
                  <a
                    href={selectedRow.gmailDraftsUrl}
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
            </>
          )}
        </section>
      </div>
    </main>
  );
}
