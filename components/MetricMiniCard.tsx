// components/MetricMiniCard.tsx

"use client";

export default function MetricMiniCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number | string;
  description?: string;
}) {
  return (
    <div className="p-4 rounded bg-white shadow">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
      {description && (
        <div className="text-xs text-gray-400 mt-1">{description}</div>
      )}
    </div>
  );
}
