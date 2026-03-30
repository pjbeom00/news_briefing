// app/api/send/route.ts - HTML 카드형 메일 발송 + Briefing sentTo / sentAT 업데이트 포함
// 2026-03-27 : 카테고리 선택값 반영 

import { sendMail } from "@/lib/gmail";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractQueryTerms(query: string) {
  return String(query || "")
    .replace(/[|,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((term) => term.trim())
    .filter(Boolean);
}

function getStopWords() {
  return new Set([
    "and",
    "or",
    "the",
    "a",
    "an",
    "of",
    "for",
    "to",
    "in",
    "on",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "as",
    "at",
    "from",
    "news",
    "briefing",
    "브리핑",
    "뉴스",
    "관련",
    "대한",
    "에서",
    "으로",
    "그리고",
    "또는",
    "및",
  ]);
}

function detectCategoryTag(query: string, selectedCategory?: string) {
  if (selectedCategory && selectedCategory !== "전체") {
    return selectedCategory;
  }

  const stopWords = getStopWords();

  const terms = extractQueryTerms(query).filter((term) => {
    const lower = term.toLowerCase();
    return term && !stopWords.has(lower) && term.length > 1;
  });

  if (!terms.length) return "뉴스";

  return Array.from(new Set(terms)).slice(0, 2).join(" · ");
}

function parseSummarySections(summary: string) {
  const lines = String(summary || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  let currentSection = "";
  const sections: Record<string, string[]> = {
    "오늘의 핵심 동향": [],
    "기사별 핵심 포인트": [],
    "기업 관점 요약": [],
    "마지막 코멘트": [],
  };

  const knownSections = Object.keys(sections);

  for (const line of lines) {
    if (!line) continue;

    const matchedSection = knownSections.find((section) =>
      line.includes(section)
    );

    if (matchedSection) {
      currentSection = matchedSection;
      continue;
    }

    if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  return sections;
}

function renderBulletList(lines: string[]) {
  if (!lines.length) return "";

  const items = lines.map((line) => {
    const cleaned = line.startsWith("- ") ? line.slice(2) : line;
    return `<li style="margin-bottom:8px;">${escapeHtml(cleaned)}</li>`;
  });

  return `
    <ul style="margin:8px 0 0 20px;padding:0;color:#374151;line-height:1.8;">
      ${items.join("")}
    </ul>
  `;
}

function buildSummaryHtml(summary: string) {
  const sections = parseSummarySections(summary);
  const blocks: string[] = [];

  if (sections["오늘의 핵심 동향"].length) {
    blocks.push(`
      <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:16px;padding:20px;margin-bottom:20px;">
        <div style="font-size:13px;color:#0f766e;font-weight:700;margin-bottom:10px;">
          오늘의 핵심 동향
        </div>
        ${renderBulletList(sections["오늘의 핵심 동향"])}
      </div>
    `);
  }

  if (sections["기사별 핵심 포인트"].length) {
    blocks.push(`
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;margin-bottom:20px;">
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:10px;">
          기사별 핵심 포인트
        </div>
        ${renderBulletList(sections["기사별 핵심 포인트"])}
      </div>
    `);
  }

  if (sections["기업 관점 요약"].length) {
    blocks.push(`
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;margin-bottom:20px;">
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:10px;">
          기업 관점 요약
        </div>
        ${renderBulletList(sections["기업 관점 요약"])}
      </div>
    `);
  }

  if (sections["마지막 코멘트"].length) {
    blocks.push(`
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;padding:20px;margin-bottom:20px;">
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:10px;">
          마지막 코멘트
        </div>
        ${renderBulletList(sections["마지막 코멘트"])}
      </div>
    `);
  }

  return blocks.join("");
}

export async function POST(req: Request) {
  try {
    const { to, summary, items, query, briefingId, category } = await req.json();

    if (!to || !to.trim()) {
      return Response.json(
        { error: "받는 사람 이메일이 비어 있습니다." },
        { status: 400 }
      );
    }

    const safeQuery = escapeHtml(query || "");
    const safeItems = Array.isArray(items) ? items : [];
    const categoryTag = detectCategoryTag(query || "", category);

    const rawSubjectQuery = (query || "뉴스").trim();
    const subjectQuery =
      rawSubjectQuery.length > 40
        ? `${rawSubjectQuery.slice(0, 40)}...`
        : rawSubjectQuery;

    const summaryHtml = buildSummaryHtml(summary || "");
    const topItems = safeItems.slice(0, 3);

    const topCards = topItems
      .map((item: any, index: number) => {
        const title = escapeHtml(item.title || "");
        const link = String(item.link || "");
        const snippet = escapeHtml(item.snippet || "");
        const pubDate = escapeHtml(item.pubDate || "");

        return `
          <div style="border:1px solid #dbeafe;border-radius:14px;padding:18px;margin-bottom:14px;background:#ffffff;">
            <div style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;
                        font-weight:700;padding:6px 10px;border-radius:999px;margin-bottom:10px;">
              TOP ${index + 1}
            </div>
            <div style="font-size:18px;font-weight:700;line-height:1.5;margin-bottom:8px;">
              <a href="${link}" style="color:#111827;text-decoration:none;" target="_blank" rel="noreferrer">
                ${title}
              </a>
            </div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">
              ${pubDate}
            </div>
            ${
              snippet
                ? `<div style="font-size:14px;line-height:1.7;color:#374151;">${snippet}</div>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    const articleCards = safeItems
      .map((item: any, index: number) => {
        const title = escapeHtml(item.title || "");
        const link = String(item.link || "");
        const snippet = escapeHtml(item.snippet || "");
        const pubDate = escapeHtml(item.pubDate || "");

        return `
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:14px;background:#ffffff;">
            <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">기사 ${index + 1}</div>
            <div style="font-size:17px;font-weight:700;line-height:1.5;margin-bottom:8px;">
              <a href="${link}" style="color:#111827;text-decoration:none;" target="_blank" rel="noreferrer">
                ${title}
              </a>
            </div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">${pubDate}</div>
            ${
              snippet
                ? `<div style="font-size:14px;line-height:1.7;color:#374151;">${snippet}</div>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    const html = `
      <div style="margin:0;padding:0;background:#f3f4f6;">
        <div style="max-width:760px;margin:0 auto;padding:32px 20px;font-family:Arial,sans-serif;color:#111827;">
          <div style="background:#111827;color:#ffffff;border-radius:16px;padding:24px 24px 20px 24px;margin-bottom:20px;">
            <div style="display:inline-block;background:#374151;color:#ffffff;font-size:12px;
                        font-weight:700;padding:6px 10px;border-radius:999px;margin-bottom:10px;">
              ${escapeHtml(categoryTag)}
            </div>
            <h1 style="margin:0;font-size:28px;line-height:1.3;">${
              safeQuery || "뉴스"
            } 브리핑</h1>
            <div style="margin-top:10px;font-size:14px;opacity:0.9;">
              ${new Date().toLocaleString("ko-KR")}
            </div>
          </div>

          ${summaryHtml}

          <div style="margin-bottom:12px;font-size:20px;font-weight:700;">오늘의 핵심 기사 TOP 3</div>
          ${topCards}

          <div style="margin-top:28px;margin-bottom:12px;font-size:20px;font-weight:700;">전체 기사 목록</div>
          ${articleCards}
        </div>
      </div>
    `;

    const subject = `[${categoryTag}] ${subjectQuery} 뉴스 브리핑 | ${new Date().toLocaleDateString(
      "ko-KR"
    )}`;

    await sendMail({
      to,
      subject,
      html,
    });

    if (briefingId) {
      await prisma.briefing.update({
        where: { id: Number(briefingId) },
        data: {
          sentTo: to,
          sentAt: new Date(),
        },
      });
    }

    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("SEND MAIL ERROR:", error);

    return Response.json(
      { error: error?.message || "메일 발송 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
