# SplitSend

ブラウザだけで、任意形式の単一ファイルを指定サイズ以下に分割し、元のファイルへ完全復元する静的Webアプリです。

- ファイルを外部サーバーへ送信しません
- インストール、アカウント、Pythonは不要です
- Google Chrome / Microsoft EdgeのFile System Access APIを使用します
- 分割結果は専用サブフォルダーへまとめて保存します
- 各パーツと元ファイルをSHA-256で検証します
- GitHub Pagesへ自動デプロイできます

## 画面の使い方

### 分割

1. 「分割」タブでファイルを選択します。
2. 1パーツの最大サイズを指定します。
3. 「保存先を選択して分割」を押します。
4. 親フォルダーを選択します。
5. 親フォルダー内に `SplitSend_ファイル名_ID` が自動作成されます。

生成例:

```text
SplitSend_example_A1B2C3D4/
├─ example_A1B2C3D4.part001
├─ example_A1B2C3D4.part002
├─ example_A1B2C3D4.splitsend.json
└─ 復元方法.txt
```

Discordなどへ送る際は、すべての `.partXXX` と `.splitsend.json` を送ってください。`復元方法.txt` は説明用です。

### 復元

1. 「復元」タブを開きます。
2. `.partXXX` と `.splitsend.json` をまとめて選択します。
3. 「復元先を選択して実行」を押します。
4. 出力ファイル名と保存先を選択します。
5. 各パーツと完成ファイルのSHA-256が一致した場合だけ保存が確定します。

## 対応ファイル

ファイルの内容を解釈せず、連続したバイト列として扱うため、基本的にすべての単一ファイル形式に対応します。

例: ZIP、7z、PDF、DOCX、XLSX、PPTX、PNG、JPEG、MP4、MKV、WAV、FLAC、EXE、MSI、ISO、CSV、BIN、ログ、CADデータ、AIモデル、拡張子なし。

フォルダーはそのままでは扱いません。先にZIPなどの単一ファイルへまとめてください。

## 正式対応環境

- Windows版 Google Chrome 最新版
- Windows版 Microsoft Edge 最新版
- HTTPSで配信されたページ、または `localhost`

`showDirectoryPicker()` と `showSaveFilePicker()` を利用できないブラウザでは、v1.0の分割・復元を実行できません。

## GitHub Pagesで公開する

### 1. リポジトリを作成

GitHubで新しいリポジトリを作成し、このプロジェクト一式をアップロードします。GitHub FreeでPagesを使う場合は、公開リポジトリにしてください。

### 2. Pagesの公開元を設定

リポジトリで次を開きます。

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

### 3. mainへpush

`main` ブランチへpushすると、`.github/workflows/pages.yml` が以下を実行します。

1. 自動テスト
2. 静的ファイル検査
3. `site/` をGitHub Pagesへアップロード
4. 公開

公開URLはActionsのデプロイ結果、または `Settings → Pages` に表示されます。

## ローカルで確認する

File System Access APIは安全なコンテキストが必要ですが、`localhost` は開発用の安全なコンテキストとして扱われます。

```powershell
cd splitsend-web
python -m http.server 8000 --directory site
```

Google Chromeで次を開きます。

```text
http://localhost:8000/
```

`index.html` をダブルクリックして `file://` で開く方法は使用しないでください。

## テスト

Node.js 22以降を使用します。外部パッケージのインストールは不要です。

```powershell
npm run check
```

実行内容:

- SHA-256既知ベクトル
- 分割→復元の完全一致
- 0バイトファイル
- パーツ破損検出
- マニフェスト検証
- Windows向けファイル名無害化
- 外部通信コードが含まれていないこと
- GitHub Pages用必須ファイルの存在

## デモパッケージ

[`examples/demo-package`](examples/demo-package) に小さな分割済みサンプルを収録しています。公開後のWeb復元画面へpartファイルとJSONを渡し、元の `demo-source.txt` と一致することを確認できます。

## 設計上の安全策

- Content Security Policyで `connect-src 'none'`
- 外部JavaScript、外部CSS、CDNなし
- アナリティクスなし
- パーツごとのSHA-256
- 元ファイル全体のSHA-256
- 復元に失敗した場合は書き込みを確定しない
- 危険なパスやファイル名を拒否または無害化
- 分割失敗・キャンセル時は専用出力フォルダーを削除
- 元ファイル全体を一度にメモリへ読み込まない

## 制限事項

- 分割は圧縮ではないため、合計サイズはほぼ変わりません。
- 分割は暗号化ではありません。
- パーツが1個でも欠けると復元できません。
- ブラウザやOSの制限により、空き容量不足を処理前に正確に検出できない場合があります。
- v1.0は単一ファイル専用です。
- スマートフォンでの巨大ファイル処理は正式保証しません。

## 仕様文書

- [分割形式](docs/FORMAT.md)
- [プライバシー](docs/PRIVACY.md)
- [セキュリティ](docs/SECURITY.md)
- [ブラウザ対応](docs/BROWSER_SUPPORT.md)
- [GitHub Pages公開手順](docs/DEPLOY.md)
- [テスト計画](docs/TEST_PLAN.md)
- [検証結果](docs/VALIDATION.md)

## ライセンス

MIT License。詳細は [LICENSE](LICENSE) を参照してください。
