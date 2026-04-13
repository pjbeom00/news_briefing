// components/LineTrendCard.tsx

"use client";

export default function LineTrendCard({
  title,
  items,
  valueKey,
}: {
  title: string;
  items: any[];
  valueKey: string;
}) {
  return (
    <div className="p-4 rounded bg-white shadow">
      <h3 className="font-bold text-sm mb-2">{title}</h3>

      <ul className="space-y-1">
        {items?.map((item, idx) => (
          <li key={idx} className="flex justify-between text-sm">
            <span>{item.date || item.label || idx}</span>
            <span>{item[valueKey]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
