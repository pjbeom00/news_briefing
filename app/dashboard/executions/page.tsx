// File: app/dashboard/executions/page.tsx

"use client"

import { useEffect, useState } from "react"

type Log = {
id: number;
query: string;
status: string;
adminDetailUrl?: string;
gmailDraftsUrl?: string;
};

async function fetchJson(url: string) {
const res = await fetch(url);
return res.json();
}

export default function ExecutionLogPage() {
const [logs, setLogs] = useState<Log[]>([]);

useEffect(() => {
fetchJson("/api/dashboard/executions").then((d) =>
setLogs(d.data || [])
);
}, []);

return (
<main style={{ padding: 20 }}>
<h1>실행 로그</h1>

{logs.map((log) => (
<div
key={log.id}
style={{
border: "1px solid #ddd",
padding: 10,
marginBottom: 10,
}}
>
<b>{log.query}</b>
<div>{log.status}</div>

<div style={{ marginTop: 10 }}>
{log.adminDetailUrl && (
<button
onClick={() =>
window.open(log.adminDetailUrl!, "_blank")
}
>
관리자 상세
</button>
)}

{log.gmailDraftsUrl && (
<button
onClick={() =>
window.open(log.gmailDraftsUrl!, "_blank")
}
>
Gmail 열기
</button>
)}
</div>
</div>
))}
</main>
);
}
