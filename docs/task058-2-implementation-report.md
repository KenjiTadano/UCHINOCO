# Task058.2 — Analysis Persistence / Stable Generation

日付: 2026-09-28

目的は、生成結果そのものを固定することではなく、再実行で揺れうる AI 解析を version と source fingerprint つきで再利用し、その後の deterministic pipeline を安定させること。

## 1. 非決定処理

| 処理 | 分類 | AI API |
| --- | --- | --- |
| Photo Intelligence semantic | A. AI / Vision | `responses.create`（keeper schema） |
| subject / pet detection（Smart Crop Vision） | A. AI / Vision | `responses.create`（bbox / focalPoint） |
| Smart Crop の枠・crop 計算 | B. deterministic | なし。保存した geometry から再計算 |
| Grouping | B. deterministic + C. memory cache | なし。タグと bbox と画素 descriptor から再計算 |
| Best Shot | B. deterministic + C. memory cache | なし |
| Candidates | B. deterministic + C. memory cache | なし |
| Story | B. deterministic + C. memory cache | なし |
| Layout ranking / frame / crop | B. deterministic + C. memory cache | なし |
| 元画像の画素（technical、descriptor） | D. source image | なし。同じバイトなら同じ結果 |

## 2. deterministic 処理

Grouping、Best Shot、Candidates、Story、Layout ranking、frame assignment、crop transform。固定した semantic と subject geometry から毎回同じ結果になることを fixture test で確認した。これらは DB に保存しない。

## 3. DB schema

`public.photo_analysis_results`

- `id uuid` PK
- `photo_id uuid` FK `photos` ON DELETE CASCADE
- `analysis_type text`
- `analysis_version text`
- `source_fingerprint text`
- `result_status text`
- `result jsonb`
- `created_at` / `updated_at`

unique index: `(photo_id, analysis_type, analysis_version, source_fingerprint)`

追加 index: `photo_id`

RLS 有効。authenticated は SELECT のみ。INSERT / UPDATE / DELETE 権限はない。書き込みは `save_photo_analysis_result` のみ。

## 4. analysis types

- `photo_intelligence_semantic`
- `subject_geometry`

1 つの JSON にはまとめない。Smart Crop の枠ごとの crop は保存しない。

## 5. source fingerprint

`src1|{storage_path}|{content_hash or none}|{updated_at}`

`photos` に file size カラムはない。バイト同一性は `content_hash`（64 桁 hex）があるときにそれを使う。未ハッシュの行は `storage_path` と `updated_at`。photoId 単独ではキーにしない。

## 6. version strategy

- semantic: `photo-intelligence-v1`（`PHOTO_INTELLIGENCE_VERSION`）
- geometry: `subject-geometry-v1`

prompt、schema、意味、validation が変わったら version を上げる。同じ version の success は通常再解析しない。`forceReanalyze` は dev の既存 `force` 引数だけで、success 行は上書きしない。

## 7. result status

- `success`: 永続化し、同じ identity では再利用する。通常処理で上書きしない。
- `fallback`: 保存してよいが、読み出しでは使わない。次の成功で置き換えてよい。
- `failed`: success cache として使わない。既存 success を failed にしない。

## 8. Memory hit

同一 process の 2 回目。わか / 2023-07。source `memory`。Vision calls 0。DB の解析テーブルは読まない。signature は true cold と同じ。

## 9. DB hit

server 停止後の再起動。Memory miss → DB hit → Vision 0。Photo Intelligence の stage は `source db`。

## 10. AI miss

解析行が空の初回。Memory miss → DB miss → Vision。schema 検証後に DB と memory へ保存。

## 11. Vision call count

- true cold: 19（9 枚 × semantic / geometry。既存の timeout retry が 1 回乗った）
- restart 1 / 2 / 3 と同一 process の warm: 0

保存行は 18。identity 18 と一致し、retry は重複行になっていない。

## 12. true cold

解析行 0 件から Generate Full Album。cache source `ai`。status はすべて `success`。semantic 9 行、subject_geometry 9 行。

## 13. restart 1

完全停止後に再起動。source `db`。Vision 0。signature は true cold と一致。

## 14. restart 2

同じく source `db`。Vision 0。signature 一致。

## 15. restart 3

trace 修正後に再度停止・再起動。source `db`。Vision 0。signature 一致。

画面: `docs/analysis-persistence-058-2-verify.png`（GOOD 92、Vision calls 0、各行 `db` / `success`）

## 16. generation signatures

4 回とも同じ。

- period: monthly 2023-07-01 起点（`2023-06-30T15:00:00.000Z` から `2023-07-31T14:59:59.999Z`）
- groups: 6
- selected scenes: 5
- selected photos: `6e407fca` `8f3ac783` `fe05770f` `69e451b7` `518333d3`
- layouts: L02 / L02 / L01
- crops: `0.4348,0.4348,1.15` / `0.4545,0.4688,1.1` / `0.4545,0.4545,1.1` / `0.49,0.4545,1.1` / `0.5,0.375,1`

これは今回の Vision 結果から再計算した出力であり、Task057 の photo や layout をコードへ書いて合わせたものではない。

## 17. version change test

`photo-intelligence-v1` の success があるとき、`photo-intelligence-v2` の要求は再利用しない。DB miss 扱いで AI 対象になる。

## 18. source change test

同じ storage path でも `content_hash` が変わると fingerprint が変わり、古い result は使わない。path / hash / `updated_at` が同じなら fingerprint は同じで DB hit になる。

## 19. duplicate race

unique index と `ON CONFLICT DO NOTHING`。remote の実データは 18 行 / 18 identity。二重 save は `success_immutable` を返し、中身は最初の success のまま。

## 20. RLS

authenticated は自分の pet の photo に紐づく行だけ SELECT できる。実 DB（ロールバック）で owner select は 1 件。

## 21. cross-owner deny

別 owner の SELECT は 0 件。別 owner からの save は「写真を読み込めませんでした」。leftover 0。

## 22. client update deny

テーブルに UPDATE / INSERT / DELETE 権限はない。authenticated からの直接 UPDATE と INSERT は権限エラー。success の置き換えと failed 上書きは関数が拒否する。

## 23. Draft AI State

この migration は `album_draft_*` と `ai_layout_id` / `ai_photo_id` / `ai_crop_*` を変更しない。解析の保存関数も draft を書かない。既存 Draft の AI State は今回の再解析では更新していない。

## 24. db reset

Docker socket がなく `supabase start` / `db reset` は未実施。Docker 設定は変更していない。remote の linked DB で migration 適用、RLS、実写真生成を確認した。

## 25. migration

local / remote を照合し、未適用は `20260928100000_photo_analysis_results.sql` だけだった。それだけを remote へ適用した。`20260927120000` と `20260927123000` は変更していない。

## 26. tsc

`npx tsc --noEmit` 成功。

## 27. build

`npm run build` 成功。

## 28. tests

`node --test tests/*.mjs` : 532 件、失敗 0。Task058.2 の 15 件を含む。

## 29. git status

commit / push はしていない。作業ツリーには Task058.2 の追加と、それ以前の未コミット変更が残っている。`git diff --check` は問題なし。
