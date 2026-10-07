# Task069 — Memory Discovery & Search

## Search model

既存のBottom Navigationが利用する`/search`を横断検索画面として拡張した。写真検索は既存の`search_photos_page` RPCを維持し、Best Shot、Story、記念日、月次／年次Albumは別々の小さなServer queryで取得する。巨大なUNION query、新規LLM検索、Vision解析は追加していない。

## Searchable metadata

- Photos: 既存RPCのPhoto AI `description` / `tags` / `activity` / `scene` / `emotion`と既存caption部分一致。
- Best Shot: 現行versionの保存済み`photo_analysis_results`にある`overallScore`。最新結果のみ採用し、80点以上を候補化。
- Stories: active Draftの`album_draft_spreads.story_type`。
- Anniversary: 保存済み`pets.birthday` / `pets.adoption_date`。日付がない場合は生成しない。
- Albums: `albums.period_from` / `period_to` / title / status。期間長から月次とYear in Reviewを表示上区別。

caption向けの新しい全文検索indexや曖昧検索は追加していない。既存RPCの安全なliteral substring検索だけを維持した。

## Structured filters

- pet（all-pet対応）
- year
- month
- season（春・夏・秋・冬）
- date range
- Best Shot
- anniversary（誕生日・お迎え日・過去の今日）
- story type
- 既存favorite / AI metadata keyword

入力値はallowlistと範囲で検証し、filter変更時にはcursorを破棄する既存設計を維持する。

## Natural language-lite

決定論的な小さな日本語文法だけを解釈する。

- `去年の今日` → 前年同日のJST範囲
- `2026年8月` → year + month
- `夏の写真` → current year + summer
- `2025年のベストショット` → year + Best Shot
- `去年の誕生日` → previous year + birthday
- `お迎えした頃` → adoption

理解できないqueryは変更せず、既存keyword searchへfallbackする。LLMは呼ばない。

## Ranking and result UX

結果は以下の順でグループ表示する。

1. Anniversary: exact saved event metadata
2. Best Shot: persisted score降順、同点は新しい写真順
3. Stories: exact story typeとactive Draft
4. Photos: 既存RPCのtimeline_at降順
5. Albums: updated_at降順、期間filter一致

結果0件では、条件解除に加えてBest Shotへの代替導線を表示し、pet・year変更を案内する。

## Performance

- Photos: 36件/page、最大50件の既存RPC上限、cursor pagination。
- Best Shot analysis: 最大120 rowをServerで取得し、候補24件、表示6件まで。
- Stories: 最大24 row、表示8件。
- Albums: 各query最大16 row、表示8件。
- 画像は表示対象だけを`createListImageUrls()`でprivate signed URL一括生成。
- 全写真をBrowserへ取得してfilterしない。
- migration / index追加なし。

## Privacy and security

- `auth.getUser()`済みのServer Component内だけで検索する。
- `owner_user_id`、`uploader_user_id`、RLSを維持する。
- `photo_pets` / `album_pets`で確認済みmulti-pet関係もpet filterへ含める。
- service role、public URL、signed URL永続化は使用しない。
- 検索query本文をanalyticsへ保存しない。Task069ではanalytics event自体を追加していない。

## Validation

- `node --experimental-strip-types --test tests/*.test.mjs`: 927 passed / 0 failed
- `npx tsc --noEmit`: passed
- scoped ESLint: passed
- `npm run build`: passed (Next.js 16.3.5 / webpack)
- `git diff --check`: passed
- migration: none

## Remaining issues

- Natural language-liteは明示した日本語パターンのみ。表記揺れや複雑な文章は通常keywordへfallbackする。
- Best Shotは保存済み現行Photo Intelligenceのscoreがある写真だけ。検索時に未解析写真を解析しない。
- Storyは正式／active Draftに保存済みのstory typeのみ。まだAlbum化されていない一時的なStory cacheは横断しない。
- 月次／年次Albumの本文検索や意味検索、Embedding/vector検索は未実装。
- 非表示の検索履歴保存と検索語analyticsは未実装。

## Git

commit / pushは実施していない。
