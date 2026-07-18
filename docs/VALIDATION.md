# Validation Results

実施日: 2026-07-18

## 自動テスト

`npm run check` の結果:

```text
12 tests passed
Static validation passed
GitHub Actions YAML parsed successfully
```

確認内容:

- SHA-256既知ベクトル
- 異なるチャンク境界での逐次SHA-256
- 分割→復元のバイト完全一致
- 0バイトファイル
- パーツ改変検出
- マニフェスト異常検出
- Windows禁止ファイル名の無害化
- 専用フォルダーへの一括出力
- キャンセル時の不完全フォルダー削除
- 不足パーツ時に出力ファイルを開かないこと
- 同梱デモパッケージの復元
- JavaScript構文検査
- HTMLとJavaScriptのID整合性
- 外部通信コードの不存在

## VESC Tool ZIPでの実データ往復試験

対象:

```text
vesc_tool_free_windows.zip
29,562,520 bytes
```

9.5 MB上限での分割結果:

```text
9,500,000 bytes
9,500,000 bytes
9,500,000 bytes
1,062,520 bytes
```

元ファイル、マニフェスト、復元結果のSHA-256:

```text
765b21293077d6e9342f6fa7579cee578e583b109da770dfeb1b6cccba034884
```

結果:

```text
バイト比較: 完全一致
SHA-256: 完全一致
```

VESC Tool本体は再配布条件が不明なため、このリポジトリには含めません。

## 512 MiB超のSHA-256試験

545,259,520 bytesの入力を1 MiB単位で逐次処理し、Node.js標準暗号実装と比較しました。

```text
SplitSend SHA-256: b0ecd8223f9209ffe8884e9bc5ce25d5f2fb7c535a69fda2b81332b6af6fe2fb
Node.js SHA-256:   b0ecd8223f9209ffe8884e9bc5ce25d5f2fb7c535a69fda2b81332b6af6fe2fb
結果: 一致
```

これにより、SHA-256パディングの64ビット長表現が必要になる512 MiB超でも一致することを確認しています。

## 残る手動確認

ブラウザのネイティブフォルダーピッカーは自動化環境から操作できないため、公開前にWindows版Chromeで次を手動確認します。

1. 保存先の親フォルダーを選択できる
2. 専用サブフォルダーが作られる
3. すべてのパーツとJSON、説明ファイルが保存される
4. Web Worker経由で処理が完了する
5. 復元先を選択できる
6. 復元後のSHA-256一致が表示される
7. キャンセル時に不完全な出力が残らない
