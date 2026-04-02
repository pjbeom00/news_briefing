// (2026-04-02) app/page.tsx : 메뉴 재구성

import Link from "next/link";

type MenuCard = {
  title: string;
  description: string;
  href: string;
  badge: string;
};

const menuCards: MenuCard[] = [
  {
    title: "뉴스 브리핑",
    description:
      "검색, 추천 키워드, 기사 랭킹, Gemini 요약, 메일 발송까지 수행하는 메인 브리핑 화면입니다.",
    href: "/news",
    badge: "서비스 화면",
  },
  {
    title: "브리핑 관리자",
    description:
      "브리핑 이력 조회, 상세 확인, 재발송, 기사 목록 확인이 가능한 관리자 화면입니다.",
    href: "/admin/briefings",
    badge: "운영 화면",
  },
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
        padding: "48px 24px",
        fontFamily:
          "Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <section
          style={{
            background: "#0f172a",
            color: "#ffffff",
            borderRadius: 24,
            padding: "36px 32px",
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.12)",
              color: "#bfdbfe",
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 999,
              padding: "6px 12px",
              marginBottom: 14,
            }}
          >
            AI NEWS BRIEFING
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              marginBottom: 14,
            }}
          >
            뉴스 브리핑 서비스
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1.9,
              color: "#cbd5e1",
              maxWidth: 760,
            }}
          >
            검색어 기반 기사 탐색, 중복 제거와 중요도 반영, Gemini 요약,
            브리핑 메일 발송, 브리핑 이력 관리까지 하나의 흐름으로 사용할 수
            있는 화면입니다.
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 20,
          }}
        >
          {menuCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <article
                style={{
                  background: "#ffffff",
                  border: "1px solid #dbeafe",
                  borderRadius: 20,
                  padding: 24,
                  minHeight: 220,
                  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "inline-block",
                      background: "#eff6ff",
                      color: "#2563eb",
                      fontSize: 12,
                      fontWeight: 800,
                      borderRadius: 999,
                      padding: "6px 10px",
                      marginBottom: 14,
                    }}
                  >
                    {card.badge}
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      fontSize: 26,
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: 12,
                    }}
                  >
                    {card.title}
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      fontSize: 15,
                      lineHeight: 1.9,
                      color: "#475569",
                    }}
                  >
                    {card.description}
                  </p>
                </div>

                <div
                  style={{
                    marginTop: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#2563eb",
                    }}
                  >
                    화면으로 이동
                  </span>

                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      background: "#2563eb",
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      fontWeight: 800,
                    }}
                  >
                    →
                  </span>
                </div>
              </article>
            </Link>
          ))}
        </section>

        <section
          style={{
            marginTop: 28,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            padding: 24,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: "#0f172a",
              marginBottom: 12,
            }}
          >
            현재 구성된 화면
          </h3>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span
              style={{
                background: "#eff6ff",
                color: "#1d4ed8",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              /news
            </span>
            <span
              style={{
                background: "#ecfeff",
                color: "#0f766e",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              /admin/briefings
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
