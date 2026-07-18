# SplitSend Format v1

## 1. 概要

SplitSend Format v1は、単一ファイルを連続したバイト範囲へ分割する形式です。パーツ自体にヘッダーや圧縮処理を加えず、元ファイルのバイトを先頭から順番に格納します。

```text
part001 = original[0 : partSize]
part002 = original[partSize : partSize * 2]
...
```

すべてのパーツを `index` 順に連結すると、元ファイルのバイト列になります。

## 2. ファイル構成

```text
prefix.part001
prefix.part002
prefix.splitsend.json
復元方法.txt  # 任意、復元には不要
```

パーツ番号の桁数は3桁以上とし、パーツ総数に応じて拡張します。

- 12パーツ: `.part001` ～ `.part012`
- 1,250パーツ: `.part0001` ～ `.part1250`

## 3. マニフェスト

```json
{
  "format": "splitsend",
  "version": 1,
  "packageId": "A1B2C3D4",
  "createdAt": "2026-07-18T00:00:00.000Z",
  "createdBy": {
    "application": "SplitSend",
    "version": "1.0.0"
  },
  "integrity": {
    "algorithm": "SHA-256"
  },
  "original": {
    "name": "example.zip",
    "size": 12345678,
    "mimeType": "application/zip",
    "lastModified": 0,
    "sha256": "...64 hexadecimal characters..."
  },
  "split": {
    "method": "contiguous-bytes",
    "partSize": 9500000,
    "partCount": 2
  },
  "parts": [
    {
      "index": 1,
      "name": "example_A1B2C3D4.part001",
      "offset": 0,
      "size": 9500000,
      "sha256": "...64 hexadecimal characters..."
    },
    {
      "index": 2,
      "name": "example_A1B2C3D4.part002",
      "offset": 9500000,
      "size": 2845678,
      "sha256": "...64 hexadecimal characters..."
    }
  ]
}
```

## 4. 必須検証

復元実装は、書き込みを確定する前に次を検証しなければなりません。

1. `format === "splitsend"`
2. `version === 1`
3. `integrity.algorithm === "SHA-256"`
4. `partCount === parts.length`
5. `partCount === max(1, ceil(original.size / partSize))`
6. `index` が1から連続している
7. `offset` が0から連続している
8. パーツ名が重複していない
9. 各パーツの実サイズが `parts[].size` と一致する
10. 各パーツのSHA-256が一致する
11. パーツ合計サイズが `original.size` と一致する
12. 復元結果全体のSHA-256が `original.sha256` と一致する

## 5. 0バイトファイル

0バイトファイルは、0バイトのパーツ1個で表現します。

```json
{
  "original": { "size": 0 },
  "split": { "partSize": 9500000, "partCount": 1 },
  "parts": [
    { "index": 1, "offset": 0, "size": 0 }
  ]
}
```

SHA-256は空入力のハッシュです。

## 6. 数値範囲

JSON内のサイズとオフセットはJavaScriptの安全な整数範囲内とします。

```text
0 <= value <= Number.MAX_SAFE_INTEGER
```

v1実装では最大パーツ数を10,000個に制限します。

## 7. ファイル名

- マニフェスト内の名前はベース名のみ
- `/`、`\\`、制御文字を禁止
- Windows予約名と禁止文字は出力時に無害化
- 復元先の名前はマニフェスト値をそのまま信頼せず再度無害化

## 8. 互換性

将来形式を変更する場合は `version` を増やします。v1の復元実装は、未知のバージョンを推測して復元せず、明確なエラーを返します。
