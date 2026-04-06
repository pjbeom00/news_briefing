// app/page.tsx - 메인 페이지, 뉴스 30개 검색 후 최종 선정 기사 10개만 화면에 보이도록 정리
// (2026-03-27) : UI 업그레이드, AI 추천 기능 추가
// (2026-03-30) : 검색 결과에 점수 정보 포함, 상위 20개 --> Gemini 재선별
// (2026-04-02) : app/page.tsx : 메뉴 재구성 및 반응형 3단 레이아웃 적용
// (2026-04-03) : 추천 키워드 고정(pin), 기사 원문 미리보기 모달, 브리핑 템플릿 2종, 뉴스 화면에서 query 받도록 수정
// (2026-04-06) File: app/news/page.tsx

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type SearchItem = {
  title: string;
  link: string;
  snippet?: string;
  pubDate?: string;
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

function NewsPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("query") || "";

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (forcedQuery?: string) => {
    const q = String(forcedQuery ?? query).trim();

    if (!q) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: q,
        }),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error((data as any).error || "검색 실패");
      }

      setItems(Array.isArray((data as any).items) ? (data as any).items : []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialQuery) return;

    setQuery(initialQuery);
    handleSearch(initialQuery);
  }, [initialQuery]);

  return (
    <main
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px 20px 40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "8px" }}>뉴스 브리핑</h1>
      <p style={{ marginTop: 0, color: "#475569", lineHeight: 1.7 }}>
        검색어를 입력하거나 다른 화면에서 전달된 검색어로 바로 검색할 수 있습니다.
      </p>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "20px",
          marginBottom: "20px",
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어 입력"
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
          }}
        />

        <button
          onClick={() => handleSearch()}
          disabled={loading || !query.trim()}
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "검색 중..." : "검색"}
        </button>
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

      <div style={{ display: "grid", gap: "12px" }}>
        {items.map((item, index) => (
          <div
            key={`${item.link}-${index}`}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "16px",
              background: "#fff",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                marginBottom: "8px",
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
            >
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#0f172a",
                  textDecoration: "none",
                }}
              >
                {item.title}
              </a>
            </div>

            {item.pubDate && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  marginBottom: "8px",
                }}
              >
                {item.pubDate}
              </div>
            )}

            {item.snippet && (
              <div
                style={{
                  fontSize: "14px",
                  color: "#334155",
                  lineHeight: 1.7,
                }}
              >
                {item.snippet}
              </div>
            )}
          </div>
        ))}

        {!loading && items.length === 0 && !error && (
          <div style={{ color: "#64748b" }}>
            아직 검색된 기사가 없습니다.
          </div>
        )}
      </div>
    </main>
  );
}

function NewsPageFallback() {
  return (
    <main
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px 20px 40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "8px" }}>뉴스 브리핑</h1>
      <div style={{ color: "#64748b" }}>화면을 준비하는 중...</div>
    </main>
  );
}

export default function NewsPage() {
  return (
    <Suspense fallback={<NewsPageFallback />}>
      <NewsPageContent />
    </Suspense>
  );
}
