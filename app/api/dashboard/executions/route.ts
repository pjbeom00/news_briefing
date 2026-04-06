// File: app/api/dashboard/executions/route.ts

import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeText(value: string) {
return String(value || "").trim().toLowerCase();
}

export async function GET(request: Request) {
try {
const url = new URL(request.url);

const keyword = normalizeText(url.searchParams.get("keyword") || "");
const status = String(url.searchParams.get("status") || "ALL").toUpperCase();
const deliveryMode = String(url.searchParams.get("deliveryMode") || "ALL").toUpperCase();

const rows = await prisma.briefingExecutionLog.findMany({
orderBy: {
createdAt: "desc",
},
take: 200,
include: {
briefing: {
select: {
id: true,
query: true,
status: true,
createdAt: true,
},
},
},
});

const filtered = rows.filter((row) => {
const keywordMatched =
!keyword ||
`${row.query} ${row.toEmail || ""} ${row.category || ""} ${row.errorMessage || ""}`
.toLowerCase()
.includes(keyword);

const statusMatched =
status === "ALL" || String(row.status || "").toUpperCase() === status;

const modeMatched =
deliveryMode === "ALL" ||
String(row.deliveryMode || "").toUpperCase() === deliveryMode;

return keywordMatched && statusMatched && modeMatched;
});

const total = filtered.length;
const successCount = filtered.filter((row) => row.status === "SUCCESS").length;
const failedCount = filtered.filter((row) => row.status === "FAILED").length;
const runningCount = filtered.filter((row) => row.status === "RUNNING").length;
const draftCount = filtered.filter((row) => row.deliveryMode === "DRAFT").length;
const sendCount = filtered.filter((row) => row.deliveryMode === "SEND").length;

return Response.json({
summary: {
total,
successCount,
failedCount,
runningCount,
draftCount,
sendCount,
},
data: filtered.map((row) => ({
id: row.id,
query: row.query,
toEmail: row.toEmail,
templateType: row.templateType,
deliveryMode: row.deliveryMode,
category: row.category,
status: row.status,
searchedCount: row.searchedCount,
finalCount: row.finalCount,
briefingId: row.briefingId,
gmailMessageId: row.gmailMessageId,
gmailThreadId: row.gmailThreadId,
gmailDraftId: row.gmailDraftId,
adminDetailUrl: row.adminDetailUrl,
adminListUrl: row.adminListUrl,
gmailDraftsUrl: row.gmailDraftsUrl,
errorMessage: row.errorMessage,
createdAt: row.createdAt,
updatedAt: row.updatedAt,
})),
});
} catch (error: any) {
console.error("DASHBOARD_EXECUTIONS_ERROR:", error);

return Response.json(
{
error: error?.message || "원클릭 실행 로그 조회 중 오류가 발생했습니다.",
},
{ status: 500 }
);
}
}
