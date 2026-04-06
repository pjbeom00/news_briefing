// app/api/send/route.ts - HTML 카드형 메일 발송 + Briefing sentTo / sentAT 업데이트 포함
// (2026-03-27) : 카테고리 선택값 반영 
// (2026-04-03) : 메일 발송 시 경영진용 요약형 / 실무자용 상세형 둘 다 템플릿 반영

// File: app/api/send/route.ts

import { prisma } from "@/lib/prisma"
import { createDraftMail, sendMail } from "@/lib/gmail"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SearchItem = {
title: string;
link: string;
snippet: string;
pubDate: string;
sourceDomain?: string;
};

type StructuredSummary = {
trend: string;
keyPoints: string[];
companyInsight: string;
comment: string;
};

type BriefingTemplateType = "EXECUTIVE" | "PRACTICAL"
type DeliveryMode = "SEND" | "DRAFT"

function escapeHtml(value: string) {
return String(value || "")
.replaceAll("&", "&amp;")
.replaceAll("<", "&lt;")
.replaceAll(">", "&gt;")
.replaceAll('"', "&quot;")
.replaceAll("'", "&#39;");
}

function buildFallbackStructured(summary: string): StructuredSummary {
return {
trend: summary || "",
keyPoints: [],
companyInsight: "",
comment: "",
};
}

function buildMailSubject(
query: string,
templateType: BriefingTemplateType,
deliveryMode: DeliveryMode
) {
const first = query
.split(",")
.map((x) => x.trim())
.filter(Boolean)[0] || "뉴스"

const label = templateType === "PRACTICAL" ? "실무형" : "경영진용"
const prefix = first.length > 24 ? `${first.slice(0, 24)}...` : first;

if (deliveryMode === "DRAFT") {
return `[${prefix}] 브리핑 (${label}) [초안]`;
}

return `[${prefix}] 브리핑 (${label})`;
}

function buildMailHtml(input: {
query: string;
structured: StructuredSummary;
items: SearchItem[];
templateType: BriefingTemplateType;
}) {
const topItems = input.items.slice(0, 3);
const otherItems =
input.templateType === "PRACTICAL"
? input.items.slice(3)
: input.items.slice(3, 6);

return `
<div style="background:#f3f4f6;padding:24px;font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;margin:0 auto;">
<tr>
<td style="background:#0f172a;border-radius:18px;padding:26px 24px 22px 24px;">
<div style="font-size:28px;font-weight:800;color:#ffffff;margin-bottom:8px;">브리핑</div>
<div style="font-size:13px;color:#cbd5e1;">${escapeHtml(input.query)}</div>
<div style="font-size:12px;color:#93c5fd;margin-top:6px;">
${input.templateType === "PRACTICAL" ? "실무자용 상세형" : "경영진용 요약형"}
</div>
</td>
</tr>

<tr><td style="height:16px;"></td></tr>

<tr>
<td style="background:#e0f2fe;border:1px solid #7dd3fc;border-radius:16px;padding:18px 20px;">
<div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:12px;">오늘의 핵심 동향</div>
<div style="font-size:15px;line-height:1.9;color:#1f2937;">
${escapeHtml(input.structured.trend)}
</div>
</td>
</tr>

<tr><td style="height:14px;"></td></tr>

<tr>
<td style="background:#ffffff;border:1px solid #dbeafe;border-radius:16px;padding:18px 20px;">
<div style="font-size:16px;font-weight:800;color:#2563eb;margin-bottom:12px;">핵심 포인트</div>
<ul style="padding-left:20px;margin:0;">
${input.structured.keyPoints
.map(
(point) => `
<li style="margin-bottom:10px;line-height:1.8;color:#1f2937;">
${escapeHtml(point)}
</li>
`
)
.join("")}
</ul>
</td>
</tr>

<tr><td style="height:14px;"></td></tr>

<tr>
<td>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="50%" valign="top" style="padding-right:7px;">
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;height:100%;">
<div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:12px;">기업 관점</div>
<div style="font-size:14px;line-height:1.9;color:#334155;">
${escapeHtml(input.structured.companyInsight)}
</div>
</div>
</td>
<td width="50%" valign="top" style="padding-left:7px;">
<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:16px;padding:18px 20px;height:100%;">
<div style="font-size:16px;font-weight:800;color:#9a3412;margin-bottom:12px;">마지막 코멘트</div>
<div style="font-size:14px;line-height:1.9;color:#7c2d12;">
${escapeHtml(input.structured.comment)}
</div>
</div>
</td>
</tr>
</table>
</td>
</tr>

<tr><td style="height:20px;"></td></tr>

<tr>
<td>
<div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:14px;">상위 3개 핵심 기사</div>
${topItems
.map(
(item, index) => `
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:18px;margin-bottom:14px;">
<div style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px;margin-bottom:10px;">
TOP ${index + 1}
</div>
<div style="font-size:17px;font-weight:800;color:#111827;line-height:1.6;margin-bottom:8px;">
<a href="${escapeHtml(item.link)}" target="_blank" style="color:#111827;text-decoration:none;">
${escapeHtml(item.title)}
</a>
</div>
<div style="font-size:12px;color:#64748b;margin-bottom:8px;line-height:1.7;">
${escapeHtml(item.pubDate || "")}
</div>
<div style="font-size:14px;line-height:1.9;color:#334155;">
${escapeHtml(item.snippet || "")}
</div>
</div>
`
)
.join("")}
</td>
</tr>

${
otherItems.length
? `
<tr><td style="height:8px;"></td></tr>

<tr>
<td>
<div style="font-size:18px;font-weight:800;color:#475569;margin-bottom:12px;">
${input.templateType === "PRACTICAL" ? "추가 확인 기사" : "그 외 기사"}
</div>
${otherItems
.map(
(item, index) => `
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:14px 16px;margin-bottom:10px;">
<div style="font-size:13px;color:#64748b;font-weight:700;margin-bottom:6px;">
기사 ${index + 4}
</div>
<div style="font-size:14px;font-weight:700;line-height:1.6;color:#111827;margin-bottom:6px;">
<a href="${escapeHtml(item.link)}" target="_blank" style="color:#111827;text-decoration:none;">
${escapeHtml(item.title)}
</a>
</div>
${
input.templateType === "PRACTICAL"
? `
<div style="font-size:13px;line-height:1.8;color:#475569;">
${escapeHtml(item.snippet || "")}
</div>
`
: ""
}
</div>
`
)
.join("")}
</td>
</tr>
`
: ""
}
</table>
</div>
`;
}

export async function POST(request: Request) {
try {
const body = await request.json();

const to = String(body?.to || "").trim();
const summary = String(body?.summary || "").trim();
const structured = (body?.structured ||
buildFallbackStructured(summary)) as StructuredSummary;
const items = Array.isArray(body?.items) ? (body.items as SearchItem[]) : [];
const query = String(body?.query || "").trim();
const briefingId = body?.briefingId ? Number(body.briefingId) : null;
const templateType = (
String(body?.templateType || "EXECUTIVE").trim().toUpperCase() ===
"PRACTICAL"
? "PRACTICAL"
: "EXECUTIVE"
) as BriefingTemplateType;
const deliveryMode = (
String(body?.deliveryMode || "SEND").trim().toUpperCase() === "DRAFT"
? "DRAFT"
: "SEND"
) as DeliveryMode;

if (!to) {
return Response.json({ error: "받는 이메일이 없습니다." }, { status: 400 });
}

if (!query) {
return Response.json({ error: "query가 비어 있습니다." }, { status: 400 });
}

if (!items.length) {
return Response.json(
{ error: "보낼 기사 목록이 없습니다." },
{ status: 400 }
);
}

const html = buildMailHtml({
query,
structured,
items,
templateType,
});

const subject = buildMailSubject(query, templateType, deliveryMode);

if (deliveryMode === "DRAFT") {
const draftResult = await createDraftMail({
to,
subject,
html,
});

if (briefingId && Number.isFinite(briefingId)) {
await prisma.briefing.update({
where: { id: briefingId },
data: {
sentTo: to,
},
});
}

return Response.json({
ok: true,
deliveryMode: "DRAFT",
draftId: draftResult.id,
messageId: draftResult.messageId,
threadId: draftResult.threadId,
sentTo: to,
});
}

const sendResult = await sendMail({
to,
subject,
html,
});

if (briefingId && Number.isFinite(briefingId)) {
await prisma.briefing.update({
where: { id: briefingId },
data: {
sentTo: to,
sentAt: new Date(),
},
});
}

return Response.json({
ok: true,
deliveryMode: "SEND",
sentTo: to,
messageId: sendResult.id,
threadId: sendResult.threadId,
});
} catch (error: any) {
console.error("SEND ERROR:", error);
return Response.json(
{
error: error?.message || "메일 발송/초안 생성 중 오류가 발생했습니다.",
},
{ status: 500 }
);
}
}
