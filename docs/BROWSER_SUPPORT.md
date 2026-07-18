# Browser Support

## 正式対応

- Windows版 Google Chrome 最新版
- Windows版 Microsoft Edge 最新版
- HTTPSまたはlocalhost

## 必須API

- File API / Blob
- Web Worker
- File System Access API
  - `showDirectoryPicker()`
  - `showSaveFilePicker()`
  - `FileSystemDirectoryHandle`
  - `FileSystemWritableFileStream`
- `crypto.getRandomValues()`

## 制限付き・未対応

File System Access APIの対応状況が異なるブラウザでは、専用フォルダーへの出力や大容量復元を保証しません。v1.0は、パーツを通常のブラウザダウンロードとしてばらばらに出力するフォールバックを意図的に実装していません。

理由は、利用者のダウンロードフォルダーへ多数のファイルが散らばることを防ぐためです。

## ローカル実行

`file://` ではなく、localhostのHTTPサーバーを使用します。

```text
python -m http.server 8000 --directory site
```
