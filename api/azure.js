// =================================================================
// 中継サーバー（プロキシ）：レシート画像を Azure Document Intelligence に送って読み取る
//
// - ブラウザはAPIキーを持たず、この中継サーバーにだけ画像を送る。
// - APIキーはVercelの環境変数（Settings > Environment Variables）で管理する：
//     AZURE_DOCUMENT_INTELLIGENCE_KEY      … Azure Document Intelligence のAPIキー
//     AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT … Azure リソースのエンドポイントURL
//                         （例: https://your-resource.cognitiveservices.azure.com）
// - Azure Document Intelligence は解析が非同期のため、
//   「解析依頼（POST）→ 完了まで確認（ポーリング）→ 結果取得」の3ステップになる。
// =================================================================

// 使用するモデル：レシート・領収書の読み取りに特化した公式モデル
const MODEL_ID = "prebuilt-receipt";
// Azure Document Intelligence REST API のバージョン
const AZURE_API_VERSION = "2024-11-30";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTリクエストのみ対応しています" });
    return;
  }

  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;

  if (!apiKey || !endpoint) {
    res.status(500).json({
      error:
        "サーバー側に AZURE_DOCUMENT_INTELLIGENCE_KEY または AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT が設定されていません（Vercelの環境変数を確認してください）",
    });
    return;
  }

  const { data } = req.body || {};
  if (!data) {
    res.status(400).json({ error: "画像データが見つかりません" });
    return;
  }

  // =====================================================================
  // Step 1: 解析リクエストを送る（Base64エンコード済み画像を送信）
  // =====================================================================
  // エンドポイント末尾のスラッシュを除いてURLを組み立てる
  const analyzeUrl = `${endpoint.replace(/\/$/, "")}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${AZURE_API_VERSION}`;

  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Azure Document Intelligence の認証はこのヘッダーでAPIキーを送る
      "Ocp-Apim-Subscription-Key": apiKey,
    },
    body: JSON.stringify({ base64Source: data }),
  });

  if (!analyzeResponse.ok) {
    const errorBody = await analyzeResponse.text();
    res.status(502).json({
      error: `Azure Document Intelligence APIエラー（${analyzeResponse.status}）: ${errorBody.slice(0, 300)}`,
    });
    return;
  }

  // =====================================================================
  // Step 2: Operation-Location ヘッダーからポーリングURLを取得
  // =====================================================================
  // Azure は解析を非同期で行う。202 レスポンスの "Operation-Location" ヘッダーに
  // 「解析の進行状況を確認するURL」が入っている。
  const operationUrl = analyzeResponse.headers.get("Operation-Location");
  if (!operationUrl) {
    res.status(502).json({
      error: "Azure APIから Operation-Location ヘッダーが返されませんでした",
    });
    return;
  }

  // =====================================================================
  // Step 3: 解析完了まで最大20秒間ポーリング（2秒間隔で最大10回）
  // =====================================================================
  let analyzeResult = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    // 2秒待ってから状態を確認する（サーバーへの負荷を抑えるため）
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pollResponse = await fetch(operationUrl, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    });

    if (!pollResponse.ok) {
      const errorBody = await pollResponse.text();
      res.status(502).json({
        error: `Azure ポーリングエラー（${pollResponse.status}）: ${errorBody.slice(0, 200)}`,
      });
      return;
    }

    const pollJson = await pollResponse.json();

    if (pollJson.status === "succeeded") {
      // 解析完了 → 結果を取り出してループを抜ける
      analyzeResult = pollJson.analyzeResult;
      break;
    } else if (pollJson.status === "failed") {
      res.status(502).json({
        error: "Azure Document Intelligence の解析に失敗しました（Azure側でエラーが発生しました）",
      });
      return;
    }
    // "running" または "notStarted" の場合はポーリングを続ける
  }

  // 20秒以内に解析が完了しなかった場合はタイムアウトエラーを返す
  if (!analyzeResult) {
    res.status(504).json({
      error: "Azure Document Intelligence がタイムアウトしました（20秒以内に解析が完了しませんでした）",
    });
    return;
  }

  // =====================================================================
  // Step 4: 解析結果から日付・金額・取引先を取り出す
  // =====================================================================
  // prebuilt-receipt モデルが返すフィールド名は英語で固定されている
  const fields = analyzeResult.documents?.[0]?.fields ?? {};

  // 取引年月日："YYYY-MM-DD" 形式の文字列（和暦は自動的に西暦に変換済み）
  const date = fields.TransactionDate?.valueDate ?? null;

  // 合計金額：小数点以下を丸めて整数にする（1200.00 → 1200）
  const rawAmount = fields.Total?.valueCurrency?.amount;
  const amount = rawAmount != null ? Math.round(rawAmount) : null;

  // 取引先名（店名・会社名）
  const vendor = fields.MerchantName?.valueString ?? null;

  const parsed = { date, amount, vendor };
  res.status(200).json({ raw: JSON.stringify(parsed), parsed });
};
