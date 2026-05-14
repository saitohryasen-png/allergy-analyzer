export async function POST(req) {
  // 環境変数の確認
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    return Response.json(
      { error: "サーバー設定エラー: APIキーが設定されていません。管理者に連絡してください。" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエストの解析に失敗しました" }, { status: 400 });
  }

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("API connection error:", err);
    return Response.json({ error: "Anthropic APIへの接続に失敗しました" }, { status: 502 });
  }

  const data = await response.json();

  if (!response.ok) {
    console.error("API error response:", { status: response.status, error: data });
    return Response.json(
      { error: data?.error?.message ?? "Anthropic APIエラー", detail: data },
      { status: response.status }
    );
  }

  return Response.json(data);
}
