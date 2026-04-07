// lib/duplicate-cleaner.ts
// 링크·제목·요약 기반 중복 기사 제거

import { textSimilarity, NewsItem } from "./clustering";

export function isDuplicate(a: NewsItem, b: NewsItem) {
  if (a.link === b.link) return true;

  const titleSim = textSimilarity(a.title, b.title);
  const snippetSim = textSimilarity(a.snippet || "", b.snippet || "");

  if (titleSim >= 0.9) return true;
  if (titleSim >= 0.78 && snippetSim >= 0.6) return true;

  return false;
}

export function removeDuplicates(items: NewsItem[]) {
  const result: NewsItem[] = [];

  for (const item of items) {
    const dup = result.some((x) => isDuplicate(item, x));
    if (!dup) result.push(item);
  }
  return result;
}
