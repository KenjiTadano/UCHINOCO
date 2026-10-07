# Task056 — UCHINOCO NOW

## 1. Existing Home Audit

- Route は `app/(app)/home/page.tsx` の Server Component。
- 旧Homeは、所有ペット全件、最近写真とお気に入り写真を各Dashboard RPCで取得し、過去の思い出候補、最大800件の写真を追加取得して今月統計をJavaScriptで集計していた。
- お気に入りRPC結果は取得していたが画面では使われておらず、最近写真を季節表示にも再利用していた。
- Heroは主に過去写真の再表示で、今日の状況、アルバム状態、記念日を比較する優先モデルはなかった。
- ペットメニューはペット詳細への遷移で、Home自体の選択コンテキストにはなっていなかった。
- 既存資産として、所有者境界を持つDashboard/写真ページRPC、`findMemoryCandidate`、`photo_analysis_results`、albums/draft、thumbnail delivery helper、petsの誕生日・お迎え日を利用できる。
- family / membership / activityの永続Schemaは確認できなかったため、推測データは表示しない。

## 2. Concept

Homeをカード型Dashboardではなく、固定構造の先頭で「今日もっとも意味のあること」を一つだけ伝える `UCHINOCO NOW` に変更した。写真があるHeroでは写真を全面に使い、データがないときだけ温かいCapture Promptを表示する。

## 3. Hero Priority

Pure function `selectUchinocoNowHero(context)` を追加した。優先順位は次の通り。

1. `ANNIVERSARY`
2. `ALBUM_READY` / `ALBUM_PROGRESS`
3. `FAMILY_NEW`
4. `TODAY_BEST_SHOT`
5. `TODAY_CAPTURE`
6. `ON_THIS_DAY`

乱数・時刻ローテーションはなく、同じcontextは常に同じ結果を返す。

## 4. Today Best Shot

当日（Asia/Tokyo）の写真だけを小さな範囲queryで取得し、保存済み `photo_analysis_results` の `photo_intelligence_semantic` にある `overallScore` を比較する。新しいVision/AI API呼び出しはない。保存済み評価がない場合は当日の最新写真へfallbackする。

## 5. Album Progress

既存 `ALBUM_CANDIDATES_CONFIG.budget.minPhotos`（12枚）を明示thresholdとして再利用した。今月写真数との差が1〜3枚の場合だけ「あとN枚」を表示し、それ以外は安易な推測をHeroに出さない。今月写真数は `taken_at` と `taken_at IS NULL + created_at` の2つのcount queryで取得する。

## 6. Album Ready

所有者・選択ペットでalbumsを絞り、album statusおよびactive draft versionのready/editing状態から候補を決める。生成済み・編集中アルバムがある場合は、その編集/閲覧導線をHeroにする。

## 7. Family Activity

family activityを裏付ける既存Schemaがないため、現在は `null` として非表示。selectorは将来の `FAMILY_NEW` contextを受け取れるが、架空のfeedや件数は生成しない。

## 8. Capture Prompt

上位イベント・アルバム・家族新着・今日写真がない場合に「今日の1枚を残しませんか？」を表示する。CTAは選択ペットの既存写真追加routeへ接続する。

## 9. Anniversary

petsの `birthday` と `adoption_date` をAsia/Tokyoの当月日で比較する。誕生日を先に判定し、対象ペット名を明示して思い出/写真追加へ案内する。

## 10. On This Day

既存 `findMemoryCandidate` を再利用し、`N年前の今日` に一致した候補だけをfallback contextへ渡す。Capture Promptより下位で、写真がない場合は出さない。

## 11. Multi-pet

`/home?pet=<petId>` と `/home?pet=all` でHome contextを切り替える。無効なpetIdは所有petsの先頭へ安全にfallbackする。「すべて」では所有pets全体をqueryし、pet固有イベントでは対象名を表示する。

## 12. Home Structure

構造を固定した。

1. UCHINOCO NOW Hero
2. Quick Actions（写真追加、アルバム、うちの子）
3. 最近の思い出（最大6枚）
4. 今月のアルバム
5. ペットsummary

未使用お気に入り取得、季節ストリップ、最大800件集計、4枚の数値Dashboard、未実装機能のquick actionを削除した。

## 13. Data Fetching

- Server ComponentとSupabase SSR clientを維持。
- 最近写真は最大6枚。
- 今日写真は日付範囲query、最大12枚。
- 今月はrow本体ではなくcountのみ。
- Heroと最近写真だけを `createListImageUrls` へ渡し、`listImagePath` でthumbnailを優先。
- signed URLはbatch生成し、DBへ保存しない。
- familyの追加query、新規AI call、original画像の一括取得はない。

## 14. Browser Verification

- 認証済み実ブラウザで `/home` を開き、わかの編集中アルバムHero、最近の思い出、編集再開CTAを確認。モバイル幅のスクリーンショットで画像・見出し・CTA・下部ナビの配置を目視した。
- `/home?pet=cf788a9a-a613-4a22-bf5e-8285a6a4142a` では、今日の写真がないヒメにCapture Promptが表示され、CTAがヒメの写真追加routeを指すことを確認。最近の写真は表示され、今月件数は0枚。
- `/home?pet=all` では2匹のsummaryと複数ペットの思い出が表示された。無効な `pet` 値は先頭の所有ペットへfallbackすることも確認。
- 実データでは album progress / ready の状態を確認できなかったため、該当状態はselector fixtureによる自動検証を根拠とする。production buildでHomeのServer Component/CSSも検証済み。

## 15. Human Review

判定: **ACCEPTABLE（認証済み実データの主要状態を目視確認済み）**

- Heroの主題とCTAは1秒で把握できる。
- 写真Heroが最も強く、数値カード集合には見えない。
- 固定セクションにより、Hero typeが変わっても画面の位置関係は安定。
- On This Dayは最下位fallbackで、Homeの主題にはならない。
- 3つのQuick Actionとアルバム節で次の操作が明確。

## 16. Regression

写真追加、multi-pet、album、Smart Layout、Editor、Decoration、Print、Checkout、image deliveryのコード経路は変更していない。全test suite 774件とproduction buildが成功した。

## 17. Tests

- 指定コマンド `node --experimental-strip-types --test tests/*.test.mjs`
- 774 passed / 0 failed
- Task056専用12ケースを追加（priority、determinism、multi-pet、empty/degraded、album threshold、thumbnail helper）。

## 18. TypeScript

`npx tsc --noEmit`: 成功。

## 19. Build

`npm run build`: 成功（Next.js 16.3.5 / webpack）。既知のRosetta 2警告のみ。

## 20. Lint

- 変更範囲lint: 成功。
- repository全体の `npm run lint`: 既存未コミット作業および `supabase/.temp` に由来する既存errorで失敗。Task056変更範囲にはerrorなし。

## 21. git diff --check

成功。

## 22. Known Issues

- 認証済み実データではCapture Prompt、編集中アルバム、multi-pet、無効なpet IDのfallbackを確認済み。album progress / ready は実データで未確認だが、selector fixtureで検証済み。
- Family Activityは対応Schemaが存在しないため意図的に非表示。
- repository全体lintはTask056外の既存errorが残る。
- Node.jsがRosetta 2で動作している警告がbuild時に出る（Task056外）。

## 23. commit / push

未実施。既存未commit差分を保持している。
