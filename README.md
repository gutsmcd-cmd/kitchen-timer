# キッチンタイマー（Kitchen Timer）

いくつでも同時に動かせるキッチンタイマーとストップウォッチの PWA。**無料・広告なし・ログイン不要・通信なし・オフライン対応。**

## できること

- 3分／5分／10分のプリセットをタップするとすぐスタート。カスタム（分・秒・名前）も作成でき、最近のカスタムは再利用可能
- 複数のタイマーを同時に。名前をタップして変更、一時停止・再開・+1分・リセット・削除
- 時間になると WebAudio で合成したアラーム音（音声ファイル不要）とバイブでお知らせ
- 動作中は Wake Lock API で画面をつけたままに（対応端末のみ）
- 終了時刻のタイムスタンプで計算するので、タブを切り替えたりアプリを閉じたりしてもずれません
- ストップウォッチ（ラップ・スプリット、最速／最遅ラップの表示）
- 表示言語：日本語 / English

※ ブラウザの制限により、画面を消したり別のアプリを使っている間はアラーム音が鳴らない場合があります。アプリに戻るとすぐ鳴ります。

## English

**Kitchen Timer** runs any number of named timers at once, with 3/5/10-minute presets and custom durations, plus a stopwatch with laps. The alarm is synthesised with WebAudio (no audio files), with vibration, and the Screen Wake Lock API keeps the display on while something is running. All timing is based on timestamps, so it stays accurate across tab switches and reloads. Japanese UI by default with an English toggle. Free, no ads, no login, no network; works offline.

Note: browsers may not play sound while the screen is off or another app is in front; the alarm rings as soon as you return.

## 開発 / Development

```bash
npm install
npm run dev      # 開発サーバー / dev server
npm run build    # 型チェック + ビルド → dist/ / type-check + build
npm run preview  # ビルドの確認 / preview the build
```

Vite + vanilla TypeScript + vite-plugin-pwa（`registerType: 'autoUpdate'`, `base: './'`）。`main` ブランチに push すると `.github/workflows/pages.yml` で GitHub Pages に公開されます。 / Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.
