"use client";

import { useState } from "react";
import SummaryCard from "@/components/SummaryCard";
import { removeDuplicates } from "@/lib/duplicate-cleaner";
import { clusterNews, NewsItem } from "@/lib/clustering";
import ClusterCard from "@/components/ClusterCard";

export default function NewsV2Page() {
  const [query, setQuery] = useState("");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [clusters, setClusters] = useState<{ id: string; items: NewsItem[] }[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    if (!query.trim()) return;

    setLoading(true);
    setSummary("");
    setClusters([]);
    setNews([]);

    try {
      // 1) 검색
      const fetchRes = await fetch("/api/briefings/execute", {
        method: "POST",
        body: JSON.stringify({ query }),
      });

      const fetchJson = await fetchRes.json();
      const items: NewsItem[] = fetchJson?.items ?? [];

      // 2) 중복 제거
      const dedup = removeDuplicates(items);

      // 3) Gemini re-rank
      const rerankRes = await fetch("/api/rerank", {
        method: "POST",
        body: JSON.stringify({
          query,
          items: dedup,
        }),
      });

      const rerankJson = await rerankRes.json();
      const ranked: NewsItem[] = rerankJson?.items ?? [];

      setNews(ranked);

      // 4) 클러스터링
      const grouped = clusterNews(ranked);
      setClusters(grouped);

      // 5) 요약 (dryRun)
      try {
        const summaryRes = await fetch("/api/send", {
          method: "POST",
          body: JSON.stringify({
            query,
            items: ranked.slice(0, 10),
            dryRun: true,
          }),
        });

        const summaryJson = await summaryRes.json();
        if (summaryJson?.summary) setSummary(summaryJson.summary);
      } catch (e) {
        console.error("summary error:", e);
      }
    } catch (error) {
      console.error("search error:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* 페이지 제목 */}
      <h1 className="text-3xl font-bold mb-3">뉴스 브리핑 (V2)</h1>
      <p className="text-gray-600 mb-6">
        클러스터링 + Top Story 기반 고도화된 뉴스 브리핑 화면입니다.
      </p>

      {/* 검색 입력 */}
      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 border rounded-lg px-4 py-2"
          placeholder="검색어를 입력하세요…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button
          className="bg-blue-600 text-white px-5 py-2 rounded-lg"
          onClick={runSearch}
          disabled={loading}
        >
          {loading ? "검색 중…" : "검색"}
        </button>
      </div>

      {/* Gemini 요약 */}
      {summary && (
        <div className="mb-8">
          <SummaryCard summary={summary} />
        </div>
      )}

      {/* Top 3 스토리 */}
      {clusters.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Top 3 주요 뉴스 스토리</h2>

          {clusters.slice(0, 3).map((cluster) => (
            <ClusterCard
              key={cluster.id}
              clusterId={cluster.id}
              items={cluster.items}
            />
          ))}
        </div>
      )}

      {/* 기타 스토리 */}
      {clusters.length > 3 && (
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-3">기타 뉴스 그룹</h2>

          {clusters.slice(3).map((cluster) => (
            <ClusterCard
              key={cluster.id}
              clusterId={cluster.id}
              items={cluster.items}
            />
          ))}
        </div>
      )}

      {/* 결과 없음 */}
      {!loading && clusters.length === 0 && (
        <div className="text-center text-gray-500 mt-10">검색 결과가 없습니다.</div>
      )}
    </div>
  );
}
