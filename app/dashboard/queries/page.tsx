// app/dashboard/queries/page.tsx
// (2026-04-06) File: app/dashboard/queries/page.tsx

// File: app/dashboard/queries/page.tsx

"use client"

import { useEffect, useState } from "react"

type SavedQuery = {
id: number;
name: string;
query: string;
category: string | null;
};

async function fetchJson(url: string, options?: any) {
const res = await fetch(url, options);
const data = await res.json();
if (!res.ok) throw new Error(data.error || "요청 실패");
return data;
}

export default function QueryDashboardPage() {
const [queries, setQueries] = useState<SavedQuery[]>([]);
const [selected, setSelected] = useState<SavedQuery | null>(null);
const [loading, setLoading] = useState(false);

const load = async () => {
const data = await fetchJson("/api/saved-queries");
setQueries(data.data || []);
};

useEffect(() => {
load();
}, []);

const rename = async (id: number, name: string) => {
await fetchJson("/api/saved-queries/rename", {
method: "POST",
body: JSON.stringify({ id, name }),
});
load();
};

const updateCategory = async (id: number, category: string) => {
await fetchJson("/api/saved-queries/category", {
method: "POST",
body: JSON.stringify({ id, category }),
});
load();
};

const execute = async (draft: boolean) => {
if (!selected) return;

setLoading(true);

const res = await fetchJson("/api/briefings/execute", {
method: "POST",
body: JSON.stringify({
query: selected.query,
deliveryMode: draft ? "DRAFT" : "SEND",
}),
});

setLoading(false);

alert("실행 완료");

// 👉 실행 후 관리자 상세 바로 이동
if (res.adminDetailUrl) {
window.open(res.adminDetailUrl, "_blank");
}

// 👉 초안이면 Gmail 열기
if (res.gmailDraftsUrl) {
window.open(res.gmailDraftsUrl, "_blank");
}
};

return (
<main style={{ padding: 20 }}>
<h1>검색어 성과</h1>

<div style={{ display: "flex", gap: 20 }}>
{/* 왼쪽 리스트 */}
<div style={{ width: 300 }}>
{queries.map((q) => (
<div
key={q.id}
onClick={() => setSelected(q)}
style={{
padding: 10,
border: "1px solid #ddd",
marginBottom: 10,
cursor: "pointer",
}}
>
<b>{q.name}</b>
<div style={{ fontSize: 12 }}>{q.query}</div>
</div>
))}
</div>

{/* 상세 */}
<div style={{ flex: 1 }}>
{selected && (
<>
<h2>{selected.query}</h2>

{/* 이름 수정 */}
<input
defaultValue={selected.name}
onBlur={(e) => rename(selected.id, e.target.value)}
style={{ width: "100%", marginBottom: 10 }}
/>

{/* 카테고리 수정 */}
<input
defaultValue={selected.category || ""}
onBlur={(e) => updateCategory(selected.id, e.target.value)}
placeholder="카테고리"
style={{ width: "100%", marginBottom: 10 }}
/>

<div style={{ display: "flex", gap: 10 }}>
<button onClick={() => execute(false)}>
🚀 즉시 발송
</button>

<button onClick={() => execute(true)}>
📝 초안만 생성
</button>
</div>
</>
)}
</div>
</div>
</main>
);
}
