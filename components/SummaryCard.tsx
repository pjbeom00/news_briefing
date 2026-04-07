// components/SummaryCard.tsx

"use client";

type SummaryCardProps = {
  title?: string;     // optional 로 변경
  summary: string;
};

export default function SummaryCard({ title, summary }: SummaryCardProps) {
  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      {title && (
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
      )}
      <p className="text-gray-700 leading-relaxed whitespace-pre-line">
        {summary}
      </p>
    </div>
  );
}
