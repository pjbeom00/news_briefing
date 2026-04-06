# File: apply_news_ui_cleanup.py
from pathlib import Path
import re

news_path = Path("app/news/page.tsx")
news = news_path.read_text(encoding="utf-8")

helper_anchor = """function normalizeText(value: string) {
  return String(value || "").toLowerCase().trim();
}
"""

helper = """
function cleanArticleSnippet(title: string, snippet?: string | null) {
  const rawTitle = String(title || "").trim();
  const rawSnippet = String(snippet || "").trim();

  if (!rawSnippet) return "";

  const normalizeForCompare = (value: string) =>
    String(value || "")
      .toLowerCase()
      .replace(/\\[[^\\]]*\\]/g, " ")
      .replace(/\\([^\\)]*\\)/g, " ")
      .replace(/[^\\p{L}\\p{N}\\s]/gu, " ")
      .replace(/\\s+/g, " ")
      .trim();

  const titleNorm = normalizeForCompare(rawTitle);
  const snippetNorm = normalizeForCompare(rawSnippet);

  if (!titleNorm) return rawSnippet;
  if (snippetNorm == titleNorm) return "";

  if (snippetNorm.startswith(titleNorm)):
    pass
}
"""

# Python용 helper 대신 TypeScript 문자열로 정확히 넣기
helper_ts = """
function cleanArticleSnippet(title: string, snippet?: string | null) {
  const rawTitle = String(title || "").trim();
  const rawSnippet = String(snippet || "").trim();

  if (!rawSnippet) return "";

  const normalizeForCompare = (value: string) =>
    String(value || "")
      .toLowerCase()
      .replace(/\\[[^\\]]*\\]/g, " ")
      .replace(/\\([^\\)]*\\)/g, " ")
      .replace(/[^\\p{L}\\p{N}\\s]/gu, " ")
      .replace(/\\s+/g, " ")
      .trim();

  const titleNorm = normalizeForCompare(rawTitle);
  const snippetNorm = normalizeForCompare(rawSnippet);

  if (!titleNorm) return rawSnippet;
  if (snippetNorm === titleNorm) return "";

  if (snippetNorm.startsWith(titleNorm)) {
    const escapedTitle = rawTitle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
    return rawSnippet
      .replace(new RegExp(`^${escapedTitle}\\\\s*[:：\\\\-–—]?\\\\s*`, "i"), "")
      .trim();
  }

  if (snippetNorm.includes(titleNorm)) {
    const escapedTitle = rawTitle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
    return rawSnippet.replace(new RegExp(escapedTitle, "ig"), "").trim();
  }

  return rawSnippet;
}
"""

if "function cleanArticleSnippet(" not in news:
    if helper_anchor not in news:
        raise SystemExit("normalizeText anchor not found in app/news/page.tsx")
    news = news.replace(helper_anchor, helper_anchor + "\n" + helper_ts)

# 1) 점수 줄 제거: finalScore
news = re.sub(
    r"""
            <div
              style=\{\{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "8px",
                fontSize: "12px",
                color: "#64748b",
              \}\}
            >
              <span>\{item\.pubDate\}</span>
              \{item\.sourceDomain && <span>· \{item\.sourceDomain\}</span>\}
              \{typeof item\.finalScore === "number" && \(
                <span>· 점수 \{item\.finalScore\.toFixed\(2\)\}</span>
              \)\}
            </div>
    """,
    """            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "10px",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              <span>{item.pubDate}</span>
              {item.sourceDomain && <span>· {item.sourceDomain}</span>}
            </div>
""",
    news,
    flags=re.VERBOSE,
)

# 2) 세부 점수 줄 제거
news = re.sub(
    r"""
            \{\(typeof item\.keywordScore === "number" \|\|
              typeof item\.tfidfScore === "number" \|\|
              typeof item\.freshnessScore === "number" \|\|
              typeof item\.importanceScore === "number"\) && \(
              <div
                style=\{\{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginBottom: "10px",
                  fontSize: "12px",
                  color: "#475569",
                \}\}
              >
                \{typeof item\.keywordScore === "number" && \(
                  <span>키워드 \{item\.keywordScore\.toFixed\(1\)\}</span>
                \)\}
                \{typeof item\.tfidfScore === "number" && \(
                  <span>TF-IDF \{item\.tfidfScore\.toFixed\(1\)\}</span>
                \)\}
                \{typeof item\.freshnessScore === "number" && \(
                  <span>최신성 \{item\.freshnessScore\.toFixed\(1\)\}</span>
                \)\}
                \{typeof item\.importanceScore === "number" && \(
                  <span>중요도 \{item\.importanceScore\.toFixed\(1\)\}</span>
                \)\}
                \{typeof item\.diversityPenalty === "number" &&
                  item\.diversityPenalty > 0 && \(
                    <span>다양성 패널티 -\{item\.diversityPenalty\.toFixed\(1\)\}</span>
                  \)\}
              </div>
            \)\}
    """,
    "",
    news,
    flags=re.VERBOSE,
)

# 3) 기사 snippet 출력 교체
news = news.replace(
    """            {item.snippet && <p style={{ margin: 0, lineHeight: 1.7 }}>{item.snippet}</p>}
""",
    """            {cleanArticleSnippet(item.title, item.snippet) && (
              <p style={{ margin: 0, lineHeight: 1.7, color: "#334155" }}>
                {cleanArticleSnippet(item.title, item.snippet)}
              </p>
            )}
""",
)

# 4) 미리보기 모달 snippet 교체
news = news.replace(
    '{previewItem.snippet || "미리보기 가능한 요약 내용이 없습니다."}',
    '{cleanArticleSnippet(previewItem.title, previewItem.snippet) || "미리보기 가능한 요약 내용이 없습니다."}',
)

news_path.write_text(news, encoding="utf-8")
print("Updated: app/news/page.tsx")
