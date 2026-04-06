// File: app/api/saved-queries/rename/route.ts

import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RenameBody = {
query?: string;
name?: string;
};

export async function POST(request: Request) {
try {
const body = (await request.json()) as RenameBody;

const query = String(body?.query || "").trim();
const name = String(body?.name || "").trim();

if (!query) {
return Response.json(
{
error: "query 값이 비어 있습니다.",
},
{ status: 400 }
);
}

if (!name) {
return Response.json(
{
error: "name 값이 비어 있습니다.",
},
{ status: 400 }
);
}

const existing = await prisma.savedQuery.findFirst({
where: {
query,
},
});

if (!existing) {
return Response.json(
{
error: "해당 query로 저장된 키워드를 찾을 수 없습니다.",
},
{ status: 404 }
);
}

const updated = await prisma.savedQuery.update({
where: {
id: existing.id,
},
data: {
name,
},
});

return Response.json({
ok: true,
data: updated,
});
} catch (error: any) {
console.error("SAVED_QUERY_RENAME_ERROR:", error);

return Response.json(
{
error: error?.message || "저장 키워드 이름 수정 중 오류가 발생했습니다.",
},
{ status: 500 }
);
}
}
