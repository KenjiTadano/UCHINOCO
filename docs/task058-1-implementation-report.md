# Task058.1 Draft Persistence Hardening 報告書

新機能は追加していない。AIの選定ロジックと config fingerprint は変更していない。commit / push はしていない。

差は Persistence の変換や Load では起きていない。同じプロセスでは `/dev/album-e2e` と `/dev/album-persistence` の Save 前 Generate は同じ `generatePetAlbum` を通り、割り当てが一致した。

---

## 1. Task057 vs Task058 drift原因

Task057の2023年7月基準は、長時間動いていた dev server のメモリ cache 上の結果だった。

- Spread 1: L02 / `6e407fca` primary / `8f3ac783` primary
- Spread 2: L12 / `4c8d611f` hero / `736ba321` secondary
- Spread 3: L01b / `518333d3` hero

Task058の Save 前表示は `生成 L02 / L12 / L01` で、Spread 2 は `736ba321` hero + `fbcf1f1b` secondary、Spread 3 は L01 だった。Save より前の `AlbumGenerationResult` が既に違っていた。

原因は次の通り。

- Photo Intelligence、Grouping descriptor、Best Shot、Candidates、Story、Draft、Smart Crop は `globalThis` 上のメモリ cache で、TTL は 30 分。Next.js の hot reload をまたいで残る。
- Photo Intelligence の Vision 呼び出しに temperature はなく、結果は DB に残らない。cache が切れると再評価される。
- Grouping は視覚 descriptor と intelligence の tag / score を使う。Best Shot と Candidate はそこから primary / secondary と採用場面を決める。
- 7月2日は、遊びの複数枚グループと `fe05770f` の単独場面が同日にある。Candidate は `richerSameMoment` と SAME_DAY のペナルティで、点差が小さい方を落とす。Vision や cache の世代が変わると、残る場面が入れ替わる。
- 1枚見開きの L01 と L01b は crop の適合点で並ぶ。点数が同じ上限に達すると、カタログ順で L01 が先に残る。Task057 の L01b は、その時点の crop / 適合点が L01b を上にしていた。

config の version 文字列は変わっていない。仕様変更ではないので fingerprint は上げていない。Task057 の photoId を hardcode して合わせていない。

プロセスを落として cache を空にしたあとの現行コードは、次で安定した。

- Library 9 / Period 8 / Scene Groups 6 / Selected 5 scenes / 5 photos / 3 spreads
- Spread 1: L02 / `6e407fca` primary / `8f3ac783` primary
- Spread 2: L02 / `fe05770f` primary / `69e451b7` primary
- Spread 3: L01 / `518333d3` hero

遊びグループ（`4c8d611f` / `736ba321` / `fbcf1f1b`）は、この cold 結果では採用されていない。

## 2. cold cache 3 runs

dev server を停止して再起動し、cache を空にした。

1回目は Best Shot / Candidates / Story / Draft が cache miss。続けて 2回目と 3回目は全 stage が cache hit。3回とも同じ割り当てで、画面は「Runs 3 · 同じ割り当て」。

もう一度プロセスを落として再起動した 1回目も、Best Shot は cache miss のまま、同じ signature だった。

signature:

`L02:6e407fca…:primary+8f3ac783…:primary|L02:fe05770f…:primary+69e451b7…:primary|L01:518333d3…:hero`

## 3. warm cache 3 runs

空 cache のあとの同一プロセスで 3 回。2回目以降は全 stage が cache hit。3回とも上記 signature と一致。

再起動前の古いプロセスでも、再計算後の 3 回は互いに一致した。その内容は cold 後とは別で、Spread 2 が L01b / `fe05770f` のみの 4 photos / 5 groups だった。古い `globalThis` cache が残っていたときの結果。

## 4. generation signature

同一プロセスでの比較。

- A. `/dev/album-e2e` Generate: L02 + L01b + L01、4 photos（`6e407fca`, `8f3ac783`, `fe05770f`, `518333d3`）
- B. `/dev/album-persistence` の Save 前 Generate: `生成 L02 / L01b / L01 · 4 photos`

B の Save 前 signature（layout、photo、role、crop）:

`L02:6e407fca…:primary:0.5:0.5:1+8f3ac783…:primary:0.4348:0.4875:1.15|L01b:fe05770f…:hero:0.4545:0.4545:1.1|L01:518333d3…:hero:0.4762:0.4967:1.05`

photo と layout は A と一致。差は Persistence に入る前から、プロセス内の cache 世代による。

## 5. Save/Load signature

上記の Save 前 signature を保存し、ページ再読込のあと Reload Draft した。

- 保存 metadata の signature と、Load 後の Effective（layout / photo / role / crop）は一致
- user layout、user photo、user crop はすべて NULL
- AI 列は生成値のまま

## 6. db reset

`supabase start` は失敗した。Docker socket `~/.docker/run/docker.sock` がない。

Docker Desktop は vmnetd の特権設定で管理者パスワードを要求し、そのダイアログが完了しなかった（applescript unexpected EOF）。そのため `supabase db reset` は実行できていない。

remote の `supabase migration list --linked` では、local と remote が `20260821080304` から `20260927123000` まで一致している。`20260927120000` の次が `20260927123000`。未適用と順序のずれはない。新しい migration は追加していない。

## 7. RLS runtime

ローカル DB が使えないため、linked DB 上で `set local role authenticated` と JWT の `sub` を切り替えて確認した。操作主体は `service_role` ではない。検証用の album は例外で巻き戻し、終了時の残り行は 0。

- User A の draft SELECT: 1 row
- User A の layout UPDATE: `applied`

## 8. cross-owner runtime

- User B の A draft SELECT: 0 rows
- User B の spread UPDATE: 0 rows
- User B の frame UPDATE: 0 rows
- User B の A album への draft INSERT: `new row violates row-level security policy for table "album_draft_versions"`

## 9. ordered guard runtime

正規の status 更新経路と同じく、`auth.uid()` が空の状態で album を `ordered` にしたあと、authenticated owner の RPC を実行した。

- layout override: `このアルバムは注文済みのため変更できません`
- crop override: 同じ
- photo override: 同じ

## 10. AI immutable runtime

authenticated owner による直接 UPDATE。

- `ai_layout_id`: `AI Stateは変更できません`
- `ai_photo_id`: 同じ
- `ai_crop_x`: 同じ

user 列の layout / crop 更新は `applied`。

## 11. paid snapshot runtime

既存 `order_photos` 8 行の id、photo、position、original_path の hash を、draft override の前後で比較した。一致した。行数も 8 のまま。

## 12. autosave race runtime

同一 frame に crop x `0.2`（seq 1）、`0.8`（seq 3）、`0.4`（seq 2）の順で RPC を送った。

- seq 3: `applied`
- あとから届いた seq 2: `stale`
- 残った `user_crop_x`: `0.8`

## 13. tsc

`npx tsc --noEmit` は成功。

## 14. build

`npm run build` は成功。

## 15. tests

`node --test tests/*.mjs` は 517 件、失敗 0。`git diff --check` も問題なし。

## 16. git status

未コミット。Task058 の追加に加え、Save 前 signature を Dev Lab で読むための `data-signature` を `app/(app)/dev/album-persistence/album-persistence-lab.tsx` に付けている。報告書は `docs/task058-1-implementation-report.md`。本番 Editor には接続していない。
