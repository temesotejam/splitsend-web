# GitHub Pages 公開手順

SplitSendはビルド不要の静的Webアプリです。リポジトリへ置くと、同梱のGitHub Actionsがテスト後に`site/`をGitHub Pagesへ公開します。

## GitHubのWeb画面だけで公開する

1. GitHubで新しいリポジトリを作成します。
2. ZIPを展開し、`splitsend-web`フォルダー内のファイルをリポジトリ直下へアップロードします。
3. 既定ブランチが`main`であることを確認します。
4. リポジトリの`Settings`を開きます。
5. 左側の`Pages`を開きます。
6. `Build and deployment`の`Source`を`GitHub Actions`にします。
7. `Actions`タブで`Test and deploy GitHub Pages`が完了するまで確認します。
8. `Settings → Pages`に表示されたURLを開きます。

通常の公開URLは次の形式です。

```text
https://ユーザー名.github.io/リポジトリ名/
```

## Gitを使って公開する

```powershell
git init
git add .
git commit -m "Initial SplitSend release"
git branch -M main
git remote add origin https://github.com/USER/REPOSITORY.git
git push -u origin main
```

push後、GitHub側で`Settings → Pages → Source → GitHub Actions`を選択します。

## 公開後の確認

Windows版Google Chromeで次を確認します。

1. ページ上部に「外部送信なし」と表示される
2. 小さなファイルを選択できる
3. 親フォルダーを選択すると専用サブフォルダーが作られる
4. `.partXXX`、`.splitsend.json`、`復元方法.txt`が保存される
5. 同じページの「復元」タブで元ファイルへ戻せる
6. 完了時にSHA-256一致が表示される

`examples/demo-package`には復元確認用の小さなサンプルがあります。

## 公開されない場合

### Actionsが実行されない

- ファイルがリポジトリ直下にあるか確認します。
- `.github/workflows/pages.yml`が存在するか確認します。
- 既定ブランチまたはpush先が`main`か確認します。

### PagesのURLが404になる

- `Settings → Pages`のSourceが`GitHub Actions`になっているか確認します。
- `Actions`でデプロイが成功しているか確認します。
- 初回公開直後はGitHub側の反映が完了してから再読み込みします。

### 分割ボタンが無効になる

- HTTPSの公開URLをChromeまたはEdgeで開きます。
- `file://`で直接開かないでください。
- ブラウザのシークレットモードや組織ポリシーでFile System Access APIが無効化されていないか確認します。

## 独自ドメイン

独自ドメインは必須ではありません。利用する場合はGitHub Pagesの設定でCustom domainを指定し、HTTPSを有効にしてください。SplitSendは相対URLで構成しているため、通常のプロジェクトPagesと独自ドメインの両方で動作します。
