"use client";

import { useState } from "react";
import Link from "next/link";
import { NewsItem } from "@/lib/clustering";

export default function ClusterCard({
  clusterId,
  items,
}: {
  clusterId: string;
  items: NewsItem[];
}) {
  const [open, setOpen] = useState(false);

  const main = items[0];
  const rest = items.slice(1);

  return (
    <div className="rounded-xl border p-5 shadow-sm bg-white mb-4">
      {/* 대표 기사 */}
      <div className="flex justify-between items-start">
        <h2 className="text-lg font-semibold leading-snug">
          {main.title}
        </h2>

        <button
          onClick={() => setOpen(!open)}
          className="text-sm text-blue-600 hover:underline ml-3"
        >
          {open ? "닫기" : `관련기사 ${rest.length}개`}
        </button>
      </div>

      <p className="text-sm text-gray-600 mt-2">{main.snippet}</p>

      <Link
        href={main.link}
        target="_blank"
        className="inline-block text-blue-500 text-sm mt-2 hover:underline"
      >
        기사 보기 →
      </Link>

      {/* 관련 기사 목록 */}
      {open && (
        <div className="mt-4 space-y-3 border-t pt-4">
          {rest.map((item, i) => (
            <div key={i} className="text-sm">
              <Link
                href={item.link}
                target="_blank"
                className="font-medium hover:underline"
              >
                {item.title}
              </Link>
              <p className="text-gray-600">{item.snippet}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
