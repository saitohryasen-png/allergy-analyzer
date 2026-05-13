export async function POST(req) {
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
    return Response.json({ error: "Anthropic APIへの接続に失敗しました" }, { status: 502 });
  }

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      { error: data?.error?.message ?? "Anthropic APIエラー", detail: data },
      { status: response.status }
    );
  }

  return Response.json(data);
}
