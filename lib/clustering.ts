// lib/clustering.ts
// 뉴스 클러스터링 알고리즘 (Top 3 → 일반 그룹 UI용)

export type NewsItem = {
  title: string;
  link: string;
  snippet: string;
  pubDate: string;
  sourceDomain?: string;
  finalScore?: number;
};

function normalize(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text: string) {
  return normalize(text).replace(/\s+/g, "");
}

function tokens(text: string) {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1);
}

function getNgrams(text: string, n = 3) {
  const c = compact(text);
  if (c.length <= n) return [c];

  const list: string[] = [];
  for (let i = 0; i <= c.length - n; i++) list.push(c.slice(i, i + n));
  return list;
}

function jaccard(a: string[], b: string[]) {
  const sA = new Set(a);
  const sB = new Set(b);

  let inter = 0;
  for (const t of sA) if (sB.has(t)) inter++;

  const union = new Set([...sA, ...sB]).size;
  return union === 0 ? 0 : inter / union;
}

export function textSimilarity(a: string, b: string) {
  const tk = jaccard(tokens(a), tokens(b));
  const ng = jaccard(getNgrams(a), getNgrams(b));
  const eq =
    compact(a) === compact(b) ||
    compact(a).includes(compact(b)) ||
    compact(b).includes(compact(a));

  return Math.max(tk, ng * 0.92, eq ? 1 : 0);
}

export function clusterNews(items: NewsItem[]) {
  const clusters: {
    id: string;
    items: NewsItem[];
    centroidTitle: string;
  }[] = [];

  for (const item of items) {
    let best = null;
    let bestSim = 0;

    for (const c of clusters) {
      const sim = textSimilarity(item.title, c.centroidTitle);
      if (sim > bestSim) {
        bestSim = sim;
        best = c;
      }
    }

    // 유사도 기준
    if (best && bestSim >= 0.78) {
      best.items.push(item);

      const newTitle =
        best.items.reduce((acc, cur) => acc + cur.title.length, 0) /
        best.items.length;

      best.centroidTitle = best.items[0].title; // 간단 centroid 유지
    } else {
      clusters.push({
        id: "cluster_" + clusters.length,
        items: [item],
        centroidTitle: item.title,
      });
    }
  }

  // 대표 기사 score 기준 정렬
  for (const c of clusters) {
    c.items.sort(
      (a, b) => (b.finalScore || 0) - (a.finalScore || 0)
    );
  }

  // 클러스터 정렬 (대표기사의 score)
  clusters.sort(
    (a, b) =>
      (b.items[0].finalScore || 0) -
      (a.items[0].finalScore || 0)
  );

  return clusters;
}
