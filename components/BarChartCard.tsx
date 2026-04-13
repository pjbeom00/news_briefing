// components/BarChartCard.tsx

"use client";

export default function BarChartCard({
  title,
  items,
  suffix = "",
}: {
  title: string;
  items: { label: string; value: number }[];
  suffix?: string;
}) {
  return (
    <div className="p-4 rounded bg-white shadow">
      <h3 className="font-bold text-sm mb-2">{title}</h3>

      <ul className="space-y-1">
        {items?.map((item, idx) => (
          <li key={idx} className="flex justify-between text-sm">
            <span>{item.label}</span>
            <span>
              {item.value}
              {suffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
