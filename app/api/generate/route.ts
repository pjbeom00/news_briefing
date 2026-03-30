export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;

    console.log("GOOGLE_SEARCH_API_KEY exists:", !!apiKey);
    console.log("GOOGLE_SEARCH_CX exists:", !!cx);
    console.log("query:", query);

    if (!apiKey || !cx) {
      return Response.json(
        {
          error:
            "GOOGLE_SEARCH_API_KEY 또는 GOOGLE_SEARCH_CX가 설정되지 않았습니다.",
        },
        { status: 500 }
      );
    }

    if (!query || !query.trim()) {
      return Response.json(
        { error: "검색어가 비어 있습니다." },
        { status: 400 }
      );
    }

    const url = new URL("https://customsearch.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "5");

    const googleRes = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const rawText = await googleRes.text();
    console.log("GOOGLE RAW RESPONSE:", rawText);

    let googleData: any;
    try {
      googleData = JSON.parse(rawText);
    } catch {
      return Response.json(
        {
          error: `Google API가 JSON이 아닌 응답을 반환했습니다: ${rawText.slice(0, 300)}`,
        },
        { status: 500 }
      );
    }

    if (!googleRes.ok) {
      return Response.json(
        {
          error:
            googleData?.error?.message || "Google 검색 API 호출 실패",
        },
        { status: googleRes.status }
      );
    }

    const items =
      googleData.items?.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        displayLink: item.displayLink,
      })) || [];

    return Response.json({ items });
  } catch (error: any) {
    console.error("SEARCH ROUTE ERROR:", error);

    return Response.json(
      {
        error: error?.message || "검색 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}