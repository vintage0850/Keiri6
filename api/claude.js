// =================================================================
// 中継サーバー（プロキシ）：レシート画像を Claude AI に送って読み取る
//
// - ブラウザはAPIキーを持たず、この中継サーバーにだけ画像を送る。
// - APIキーはここ（Vercelの環境変数 CLAUDE_API_KEY）で管理する。
//   ※ コードには書かない。Vercelの管理画面（Settings > Environment
//     Variables）で CLAUDE_API_KEY という名前で設定する。
// - これにより、公開したデモでもAPIキーを公開せずに
//   「誰でも Claude AI で読み取れる」状態を作れる。
// =================================================================

// 使用するClaudeのモデル
// haiku は軽量・高速でコスト効率が良く、レシートの読み取り用途に適している。
// より精度を上げたい場合は "claude-sonnet-4-6" に変更する。
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// Claude に送る指示文（日本語のレシートを想定）
// 「JSON形式のみで回答」と明示することで、余分な説明文が混入するのを防ぐ。
const CLAUDE_PROMPT = `これは日本のレシート（領収書）の画像です。
次の3項目を読み取り、JSON形式のみで回答してください（前置きや説明は不要です）。

{"date": "YYYY-MM-DD", "amount": 1200, "vendor": "店名"}

- date: 取引年月日。"YYYY-MM-DD" 形式の文字列。和暦（令和・平成など）の場合は西暦に変換すること。読み取れない場合は null。
- amount: 合計金額（税込の最終的な支払金額）。数字のみの整数。読み取れない場合は null。
- vendor: お店・会社名の文字列。読み取れない場合は null。`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTリクエストのみ対応しています" });
    return;
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "サーバー側に CLAUDE_API_KEY が設定されていません（Vercelの環境変数を確認してください）",
    });
    return;
  }

  const { mimeType, data } = req.body || {};
  if (!data) {
    res.status(400).json({ error: "画像データが見つかりません" });
    return;
  }

  // Claude API にリクエストを送る
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType || "image/jpeg",
                data,
              },
            },
            { type: "text", text: CLAUDE_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    res.status(502).json({
      error: `Claude APIエラー（${response.status}）: ${errorBody.slice(0, 200)}`,
    });
    return;
  }

  const json = await response.json();
  const text = json?.content?.[0]?.text;
  if (!text) {
    res.status(502).json({ error: "Claude AI から読み取り結果を取得できませんでした" });
    return;
  }

  // Claude のレスポンスにマークダウンのコードブロック（```json ... ```）が
  // 含まれることがあるため、取り除いてから JSON として解析する。
  try {
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    res.status(200).json({ raw: text, parsed });
  } catch (e) {
    res.status(502).json({
      error: `JSONの解析に失敗しました。Claude AIの回答：${text.slice(0, 100)}`,
    });
  }
};
