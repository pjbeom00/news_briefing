// components/QualityBadge.tsx

"use client";

export default function QualityBadge({
  score,
}: {
  score: number;
}) {
  let color = "bg-gray-200";

  if (score >= 80) color = "bg-green-200";
  else if (score >= 50) color = "bg-yellow-200";
  else color = "bg-red-200";

  return (
    <span className={`px-2 py-1 text-xs rounded ${color}`}>
      {score}
    </span>
  );
}
