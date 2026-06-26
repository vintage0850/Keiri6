# Webデモ（動作イメージ確認用）

`index.html` をダブルクリックしてブラウザで開くだけで動作します。
インストールや準備は一切不要です。

## できること
- レシート一覧の表示・検索（取引年月日／取引金額／取引先で絞り込み）
- 「レシートを追加」→ 撮影・画像選択 → 自動読み取り（OCR） → 内容確認 → 保存
- 記録の編集・削除と、変更履歴（編集・削除不可）の確認

## 撮影・自動読み取り（OCR）について
- 「📷 レシートを撮影 / 画像を選ぶ」を押すと、スマホではカメラが起動し、
  PCでは画像ファイルを選べます。
- 選んだ画像から「Tesseract.js」という仕組みで文字を読み取り、
  日付・金額・お店の名前を自動で入力します。
- 読み取りには数秒〜数十秒かかることがあり、**インターネット接続が必要**です
  （文字認識に使うデータをその都度ネット経由で読み込むため）。
- 写真が無い場合や、すぐに動作確認したい場合は「サンプルデータで試す」で
  読み取り結果を再現できます。
- 読み取り結果はあくまで候補です。間違っていてもその場で修正して保存できます。
- 日付は「2026年6月15日」「2026/06/15」「令和8年6月15日」など、よくある表記に対応しています。
- 自動入力されない・間違っている場合は、「読み取った文字を確認する」を開くと
  実際にOCRが読み取った文字がそのまま表示されます。レシートの日付表記が
  想定外の形式の場合は、ここに表示された文字を教えてもらえれば対応を追加できます。

## Gemini API（高精度・お試し用）について
画像から直接「日付・金額・店名」をAIに読み取らせる、お試し用の機能です。
全角数字や和暦（令和など）、レイアウトの違いにも強く、Tesseract.jsより
高精度な読み取りが期待できます。

呼び出し方法には2種類あり、`index.html` が自動で切り分けます。

### A. 自分のPCで動作確認する（事前にキーを設定しておく方式）
1. [Google AI Studio](https://aistudio.google.com/) でAPIキーを取得する
2. `gemini-config.example.js` をコピーして、同じフォルダに
   `gemini-config.js` という名前で保存する
3. `gemini-config.js` を開き、`window.GEMINI_API_KEY = ""` の `""` の中に
   取得したAPIキーを貼り付けて保存する
4. `index.html` を開く（開き直す）と、「Gemini APIで読み取る」が自動でオンになり、
   キーを毎回入力せずに使えるようになります

#### 注意事項
- **APIキーが必要です**。利用量に応じて費用が発生する場合があります。
- `gemini-config.js` は `.gitignore` に登録されているため、GitHubには
  アップロードされません。**`gemini-config.example.js` の方には、絶対に
  実際のキーを書き込まないでください**（こちらはアップロード対象です）。
- 「レシートを追加」画面でチェックを外すと、いつでもTesseract.jsに戻せます。
- ⚠️ この方法はAPIキーをブラウザから直接送信するため、**自分のPCで動作確認する
  お試し用**に限定してください。

### B. 公開したデモで、誰でもキー入力なしに使えるようにする（中継サーバー方式）
`gemini-config.js` を設定していない状態で `index.html` を開くと、代わりに
中継サーバー（`/api/gemini`）を経由してGemini APIを呼び出します。APIキーは
サーバー側だけで管理されるため、訪問者にキーを入力させたり、キーを公開したり
する必要がありません。

設定方法は下記「[公開してGemini OCRを使えるようにする（Vercel）](#公開してgemini-ocrを使えるようにするvercel)」を参照してください。

## 注意事項
- これは見た目・操作感を確認するための**デモ**です。
- データはブラウザのタブを閉じると消えます（保存されません）。
- SwiftUI版（iPhoneアプリ）では、同じ考え方でVisionKit/Visionフレームワークを
  使って撮影・読み取りを行っています。

## 公開してGemini OCRを使えるようにする（Vercel）
このフォルダには `api/gemini.js` という中継サーバー（プロキシ）用のファイルが
含まれています。これを [Vercel](https://vercel.com/)（無料のホスティング
サービス）にアップロードすると、公開URLでアプリを誰でも開けるようになり、
「Gemini APIで読み取る」もAPIキーの入力なしで使えるようになります。

### 手順
1. このフォルダ（`web-demo`）の中身をGitHubのリポジトリにアップロードする
   （`gemini-config.js` は `.gitignore` により自動的に除外されます）
2. [Vercel](https://vercel.com/) にアクセスし、GitHubアカウントでログインする
3. 「Add New...」→「Project」から、1でアップロードしたリポジトリを選択して
   インポートする（設定は変更せず「Deploy」を押してOKです）
4. デプロイ完了後、Vercelの管理画面で「Settings」→「Environment Variables」
   を開き、以下を追加する
   - Key: `GEMINI_API_KEY`
   - Value: [Google AI Studio](https://aistudio.google.com/) で取得したAPIキー
5. 「Deployments」タブから最新のデプロイを「Redeploy」する
   （環境変数は再デプロイ後に反映されます）
6. 発行された公開URL（`https://〇〇.vercel.app`）を開き、「レシートを追加」→
   「Gemini APIで読み取る」をチェックして動作確認する（キー入力欄は表示されません）

### 運用上の注意
- 公開URLにアクセスした人は誰でもGemini APIを使えるようになります。利用量に
  応じて費用が発生するため、想定外の利用が心配な場合は[Google AI Studio](https://aistudio.google.com/)
  またはGoogle Cloud Consoleの「APIキーの制限」「利用量の上限」設定で、
  事前に上限を決めておくと安心です。
- コードを更新してGitHubにpushすると、Vercel側にも自動的に反映されます。

## Azure Document Intelligence で読み取れるようにする

このフォルダには `api/azure.js` という中継サーバー（プロキシ）用のファイルが含まれています。
Microsoft Azure の帳票読み取りAI（prebuilt-receipt モデル）を使い、
Claude AI と同等の精度でレシートの「日付・金額・店名」を自動読み取りできます。

### 必要なもの
- Microsoft Azure アカウント（個人用は無料プランあり）
- Azure Document Intelligence リソース（以下の手順で作成）
- エンドポイントURL と APIキー（リソース作成後に取得）

### 手順

#### A. Azure でリソースを作成する
1. [Azure Portal](https://portal.azure.com/) にログインする
2. 「リソースの作成」→「AIサービス」→「Document Intelligence」を検索して作成する
   - リージョン：Japan East（東日本）を推奨
   - 価格レベル：Free（F0）で月2000回まで無料
3. 作成後、リソースの「キーとエンドポイント」ページを開き、以下をメモする
   - **エンドポイント**（例: `https://your-resource.cognitiveservices.azure.com`）
   - **キー1**（英数字の長い文字列）

#### B. Vercel に公開してデモで使えるようにする
1. このフォルダ（`web-demo`）の中身をGitHubのリポジトリにアップロードする
2. [Vercel](https://vercel.com/) にアクセスし、GitHubアカウントでログインしてデプロイする
3. デプロイ完了後、Vercelの管理画面で「Settings」→「Environment Variables」を開き、以下を追加する
   - Key: `AZURE_DI_KEY` / Value: 上でメモした「キー1」
   - Key: `AZURE_DI_ENDPOINT` / Value: 上でメモした「エンドポイント」
4. 「Deployments」タブから最新のデプロイを「Redeploy」する
5. 発行された公開URLを開き、「レシートを追加」→「Azure Document Intelligence」を選んで動作確認する

### 動作の仕組み（参考）
Azure Document Intelligence の解析は「依頼 → 待機 → 結果取得」の3ステップになっています。
`api/azure.js` の中でこのポーリング処理を自動で行うため、
呼び出す側（ブラウザ）はリクエストを1回送るだけで結果を受け取れます。

### 運用上の注意
- Free プラン（F0）は月2,000ページまで無料（1枚のレシートが1ページ）
- 上限を超えた場合の料金は [Azure 価格ページ](https://azure.microsoft.com/ja-jp/pricing/details/ai-document-intelligence/) で確認できます

---

## 今後Webアプリ化する場合
このファイルはNext.js + Tailwind CSSへ移行する際の土台として使えます。
- `theme` オブジェクト → `tailwind.config.js` の色設定
- 各関数（`filterReceipts` など）→ そのままロジックとして移植可能
- 各コンポーネント（`Header`, `FilterArea`, `ReceiptDetailModal` など）→ そのままコンポーネントファイルに分割
- `api/gemini.js` / `api/claude.js` / `api/azure.js` → そのままNext.jsのAPI Route（`app/api/*/route.ts`）として移植可能
