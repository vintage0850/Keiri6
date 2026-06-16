// =================================================================
// 中継サーバー（プロキシ）：レシート画像をGemini APIに送って読み取る
//
// - ブラウザはAPIキーを持たず、この中継サーバーにだけ画像を送る。
// - APIキーはここ（Vercelの環境変数 GEMINI_API_KEY）で管理する。
//   ※ コードには書かない。Vercelの管理画面（Settings > Environment
//     Variables）で設定する。
// - これにより、公開したデモでもAPIキーを公開せずに
//   「誰でもGemini APIで読み取れる」状態を作れる。
// =================================================================

// 使用するGemini APIのモデル名（候補）。上から順に試す。
const GEMINI_MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

// Geminiに送る指示文（日本語のレシートを想定）
const GEMINI_PROMPT = `これは日本のレシート（領収書）の画像です。
次の3項目を読み取り、指定したJSON形式だけで回答してください。
- date: 取引年月日。"YYYY-MM-DD" 形式の文字列。和暦（令和・平成など）の場合は西暦に変換すること。読み取れない場合は null。
- amount: 合計金額（税込の最終的な支払金額）。数字のみの整数。読み取れない場合は null。
- vendor: お店・会社名の文字列。読み取れない場合は null。`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTリクエストのみ対応しています" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "サーバー側にGEMINI_API_KEYが設定されていません（Vercelの環境変数を確認してください）",
    });
    return;
  }

  const { mimeType, data } = req.body || {};
  if (!data) {
    res.status(400).json({ error: "画像データが見つかりません" });
    return;
  }

  const requestBody = {
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          { inline_data: { mime_type: mimeType || "image/jpeg", data } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING", nullable: true },
          amount: { type: "INTEGER", nullable: true },
          vendor: { type: "STRING", nullable: true },
        },
      },
    },
  };

  // 候補のモデルを上から順に試す。「モデルが見つからない（404）」場合のみ、
  // 次の候補に切り替える（それ以外のエラーは、その場で返す）。
  let lastError = { status: 502, body: "Gemini APIから応答がありませんでした" };
  for (const model of GEMINI_MODEL_CANDIDATES) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const json = await response.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        res.status(502).json({ error: "Gemini APIから読み取り結果を取得できませんでした" });
        return;
      }
      res.status(200).json({ raw: text, parsed: JSON.parse(text) });
      return;
    }

    const errorBody = await response.text();
    lastError = { status: response.status, body: errorBody.slice(0, 200) };
    if (response.status !== 404) break;
    // 404（モデルが見つからない／廃止済み）の場合は、次の候補を試す
  }

  res.status(502).json({ error: `Gemini APIエラー（${lastError.status}）: ${lastError.body}` });
};
