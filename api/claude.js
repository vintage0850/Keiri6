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
const CLAUDE_MODEL = "claude-sonnet-4-6";

// Claude に送る指示文（日本語のレシートを想定）
// 「JSON形式のみで回答」と明示することで、余分な説明文が混入するのを防ぐ。
const CLAUDE_PROMPT = `これは日本のレシートまたは領収書の画像です。
次の3項目を読み取り、JSON形式のみで回答してください（前置きや説明は不要です）。

{"date": "YYYY-MM-DD", "amount": 1200, "vendor": "店名"}

読み取りのポイント：
- date: 取引年月日。YYYY-MM-DD形式の文字列。
  「令和7年」は2025年、「令和8年」は2026年に変換する。
  レシートは上部付近、領収書は「日付」「年月日」の横を確認する。
  読み取れない場合は null。
- amount: 税込の最終支払金額。「合計」「お買上金額」「ご請求金額」の横の数字。
  カンマ・円記号を除いた整数で返す。読み取れない場合は null。
- vendor: 店名・会社名。レシート上部または領収書の「殿」の上に記載が多い。
  読み取れない場合は null。

画像が暗い・文字が小さい場合でも、読み取れた範囲で必ずJSONを返すこと。`;

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
