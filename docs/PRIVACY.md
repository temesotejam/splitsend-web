# Privacy

SplitSend v1.0は完全な静的Webアプリです。

## 収集しない情報

- 選択したファイルの内容
- ファイル名
- ファイルサイズ
- 分割結果
- IPアドレスを利用した独自ログ
- 操作履歴
- Cookie
- ローカルストレージ
- アナリティクス

GitHub Pages自体の配信に伴うGitHub側の運用ログについては、GitHubのプライバシーポリシーが適用されます。SplitSendのコードは、ファイル内容をネットワークへ送信しません。

## 技術的な制限

`index.html`のContent Security Policyで次を設定しています。

```text
connect-src 'none'
```

これにより、ページ上のJavaScriptからFetch、WebSocketなどによる外部接続を行えないようにします。また、外部CDNや外部スクリプトを使用しません。
