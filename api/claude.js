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
// 出力フォーマットは下記の extract_receipt_info ツール（Function Calling）側で
// 強制するため、ここでは読み取りのポイントだけを伝える。
const CLAUDE_PROMPT = `これは日本のレシートまたは領収書の画像です。
extract_receipt_info ツールを使って、次の3項目を読み取ってください。

読み取りのポイント：
- date: 取引年月日。YYYY-MM-DD形式の文字列。
  「令和7年」は2025年、「令和8年」は2026年に変換する。
  レシートは上部付近、領収書は「日付」「年月日」の横を確認する。
  読み取れない場合は null。
- amount: 税込の最終支払金額。「合計」「お買上金額」「ご請求金額」の横の数字。
  「小計」や「外税」など内訳の数字ではなく、最終的に支払った金額を選ぶこと。
  カンマ・円記号を除いた整数で返す。読み取れない場合は null。
- vendor: 店名・会社名。レシート上部または領収書の「殿」の上に記載が多い。
  読み取れない場合は null。

具体例：
- 「小計 980円／消費税 98円／合計 1,078円」と並んでいる場合
  → amount は 1078（内訳の980や98ではなく、最終的な合計を選ぶ）
- 「令和7年3月15日」と書かれている場合 → date は "2025-03-15"
- レシート上部に住所や電話番号と一緒に店名が書かれている場合
  → vendor は店名のみ（住所・電話番号・「TEL」などは含めない）

画像が暗い・文字が小さい場合でも、読み取れた範囲で必ずツールを呼び出すこと。`;

// Claude のツール定義（Function Calling）
// JSON形式での回答を「お願い」するのではなく、スキーマで強制することで
// マークダウンの混入や解析失敗（JSON.parseエラー）を構造的に防ぐ。
const RECEIPT_TOOL = {
  name: "extract_receipt_info",
  description: "レシート・領収書の画像から日付・金額・店名を抽出する",
  input_schema: {
    type: "object",
    properties: {
      date: {
        type: ["string", "null"],
        description: "取引年月日。YYYY-MM-DD形式。読み取れない場合は null。",
      },
      amount: {
        type: ["integer", "null"],
        description: "税込の最終支払金額（整数）。読み取れない場合は null。",
      },
      vendor: {
        type: ["string", "null"],
        description: "店名・会社名。読み取れない場合は null。",
      },
    },
    required: ["date", "amount", "vendor"],
  },
};

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
      tools: [RECEIPT_TOOL],
      // ツールを必ず呼び出させることで、回答が必ず構造化データになる
      tool_choice: { type: "tool", name: "extract_receipt_info" },
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
  // ツール呼び出し（tool_use）ブロックから読み取り結果を取得する。
  // テキストからJSONを抜き出す方式と違い、Claudeが必ずスキーマ通りの
  // データを返すため、マークダウン混入や解析失敗が起こらない。
  const toolUse = json?.content?.find((block) => block.type === "tool_use");
  if (!toolUse?.input) {
    res.status(502).json({ error: "Claude AI から読み取り結果を取得できませんでした" });
    return;
  }

  res.status(200).json({ raw: JSON.stringify(toolUse.input), parsed: toolUse.input });
};
