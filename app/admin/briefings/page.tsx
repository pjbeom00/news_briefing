// app/admin/briefings/page.tsx
// (2026-04-03) : 관리자 화면 UX 정리
// (2026-04-06) File: app/admin/briefings/page.tsx

// File: app/admin/briefings/page.tsx

"use client"

import { useEffect, useState } from "react"

type Briefing = {
id: number;
query: string;
summary: string;
};

async function fetchJson(url: string) {
const res = await fetch(url);
return res.json();
}

export default function AdminPage() {
const [list, setList] = useState<Briefing[]>([]);
const [selected, setSelected] = useState<Briefing | null>(null);

useEffect(() => {
fetchJson("/api/briefings").then((d) =>
setList(d.data || [])
);
}, []);

return (
<main style={{ padding: 20 }}>
<h1>브리핑 관리자</h1>

<div style={{ display: "flex", gap: 20 }}>
{/* 히스토리 */}
<div style={{ width: 300 }}>
{list.map((b) => (
<div
key={b.id}
onClick={() => setSelected(b)}
style={{
border: "1px solid #ddd",
padding: 10,
marginBottom: 10,
cursor: "pointer",
}}
>
<b>{b.query}</b>
</div>
))}
</div>

{/* 상세 */}
<div style={{ flex: 1 }}>
{selected && (
<>
<h2>{selected.query}</h2>
<p>{selected.summary}</p>
</>
)}
</div>
</div>
</main>
);
}
