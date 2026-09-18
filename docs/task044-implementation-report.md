# UCHINOCO v1.1 Task044 実装報告書

## 概要

| 項目 | 内容 |
|------|------|
| タスク | Task044: AI Album 生成・編集フロー実装 |
| ブランチ | `feature/task043-album-top` (task043 ブランチに継続実装) |
| 基点コミット | `cda8ad6` (task043 docs) |
| 実施日 | 2026-09-18 |
| 種別 | 新機能（DB スキーマ追加 + UI 実装） |

---

## 1. 変更ファイル一覧

| ファイル | 種別 | 変更の主旨 |
|----------|------|-----------|
| `supabase/migrations/20260918000001_albums.sql` | 新規 | albums + album_photos テーブル + RLS + reorder RPC |
| `lib/supabase/database.types.ts` | 更新 | albums / album_photos / reorder_album_photos の型定義追加 |
| `lib/album-selection.ts` | 新規 | ルールベース写真選定アルゴリズム + fallback タイトル生成 |
| `app/(app)/pets/[petId]/album/new/page.tsx` | 更新 | coming soon → 期間選択 + 枚数表示 Server Component |
| `app/(app)/pets/[petId]/album/new/album-create-form.tsx` | 新規 | 期間選択 + 生成 CTA クライアントコンポーネント |
| `app/(app)/pets/[petId]/album/new/actions.ts` | 新規 | `createAlbumDraft` Server Action |
| `app/(app)/pets/[petId]/album/[albumId]/page.tsx` | 新規 | アルバム詳細ページ（カバー / プレビュー / 編集） |
| `app/(app)/pets/[petId]/album/[albumId]/actions.ts` | 新規 | title 更新 / photo add / photo remove / reorder / delete |
| `app/(app)/pets/[petId]/album/[albumId]/album-title-form.tsx` | 新規 | タイトル編集フォーム（クライアント） |
| `app/(app)/pets/[petId]/album/[albumId]/album-photo-controls.tsx` | 新規 | 写真並び替え・削除コントロール（クライアント） |
| `app/(app)/pets/[petId]/album/[albumId]/album-delete-control.tsx` | 新規 | アルバム削除確認（クライアント） |
| `app/(app)/pets/[petId]/album/[albumId]/add/page.tsx` | 新規 | 写真追加ピッカーページ |
| `app/(app)/pets/[petId]/album/page.tsx` | 更新 | 棚セクションに実 album 一覧を表示 |
| `tests/album.test.mjs` | 新規 | album-selection アルゴリズム + fallback title 単体テスト |

---

## 2. Album DB Schema

```sql
albums (
  id uuid PK,
  owner_user_id uuid → auth.users,
  pet_id uuid → pets,
  title text NOT NULL DEFAULT '',
  status text CHECK IN ('draft','ready','ordered','archived') DEFAULT 'draft',
  period_from timestamptz,
  period_to timestamptz,
  cover_photo_id uuid → photos (ON DELETE SET NULL),
  created_at timestamptz,
  updated_at timestamptz
)

album_photos (
  album_id uuid → albums (ON DELETE CASCADE),
  photo_id uuid → photos (ON DELETE CASCADE),
  position integer DEFAULT 0,
  selected_by text CHECK IN ('ai','user') DEFAULT 'ai',
  created_at timestamptz,
  PRIMARY KEY (album_id, photo_id)   ← 1 photo per album guaranteed
)
```

**インデックス:**
- `albums (owner_user_id, pet_id, created_at DESC)`
- `album_photos (album_id, position)`

---

## 3. Migration

ファイル: `supabase/migrations/20260918000001_albums.sql`

- `BEGIN` / `COMMIT` でトランザクション化
- テーブル作成 → インデックス → RLS ポリシー → `updated_at` トリガー → `reorder_album_photos` RPC
- Service Role をプロダクトパスで使用しない方針を維持

---

## 4. RLS

### albums

| ポリシー | 条件 |
|----------|------|
| SELECT | `owner_user_id = auth.uid()` |
| INSERT | `owner_user_id = auth.uid()` |
| UPDATE | `owner_user_id = auth.uid()` (USING + WITH CHECK) |
| DELETE | `owner_user_id = auth.uid()` |

### album_photos

| ポリシー | 条件 |
|----------|------|
| SELECT | `EXISTS (albums WHERE id = album_id AND owner_user_id = auth.uid())` |
| INSERT | 同上 |
| UPDATE | 同上 |
| DELETE | 同上 |

`album_photos` は `owner_user_id` 列を持たず、親 `albums` を通してアクセス制御。

---

## 5. Draft 生成フロー (`createAlbumDraft`)

```
1. UUID バリデーション
2. auth.getUser() — 未認証 → error state
3. pets から pet ownership 確認
4. period_from / period_to を period 選択値から計算
5. Promise.all:
   a. photos (limit 200, primary scope, period フィルタ)
   b. photo_ai_analyses (status=completed) — 全件(認証ユーザーのみ参照可)
6. AI 解析データをマップして AlbumCandidate[] を構築
7. selectAlbumPhotos() でルールベース選定
8. generateFallbackTitle() でタイトル生成
9. OPENAI_API_KEY あれば gpt-4o-mini でタイトル改善 (テキストのみ、画像送信なし)
   - 8秒 timeout / 失敗時は fallback タイトルを使用
10. albums INSERT → id 取得
11. album_photos INSERT (bulk)
    - 失敗時: albums DELETE でクリーンアップ
12. redirect → /pets/[petId]/album/[albumId]
```

---

## 6. AI 選定方法

画像を AI に送らない。既存 `photo_ai_analyses` (completed のみ) を利用。

```typescript
type AlbumCandidate = {
  // ... photos fields
  activity: string | null  // from photo_ai_analyses
  scene: string | null
  emotion: string | null
  tags: string[] | null
}
```

スコアリング（高いほど優先）:
| 条件 | スコア |
|------|--------|
| favorite = true | +3 |
| activity あり | +1 |
| scene ≠ "その他" | +1 |
| emotion ≠ "不明" | +1 |
| tags.length > 0 | +1 |
| caption あり | +1 |

**多様性キャップ:** 同一 activity/scene は最大 8 枚まで。

**タイトル生成 AI 使用量 (最小限):**
- モデル: `gpt-4o-mini`
- 入力: テキストのみ (ペット名, 期間ラベル, 上位タグ/活動/シーン)
- max_tokens: 40
- store: false

---

## 7. Fallback

`OPENAI_API_KEY` 未設定 / AI 呼び出し失敗 / タイムアウト (8秒) → `generateFallbackTitle()` を使用。

```typescript
// 1か月以内 → "ここのとの思い出 8月"
// それ以上 → season から "ここのとの夏 2026年"
```

AI が使えなくても draft が作成される設計。

---

## 8. Album Create Page (`/pets/[petId]/album/new`)

```
Server Component (page.tsx):
  - Auth + pet ownership 確認
  - 総写真枚数取得 (count only)
  - AlbumCreateForm (Client Component) に petId を渡す

Client Component (album-create-form.tsx):
  - 期間選択 (最近3か月 / 半年 / 1年 / すべて)
  - radio → styled label (ハイライト)
  - useActionState(createAlbumDraft.bind(null, petId))
  - pending 中: "アルバム案を作成中..."
  - error 表示 (app-error)
```

---

## 9. Album Result Page (`/pets/[petId]/album/[albumId]`)

```
[ カバーコラージュ ]
  AlbumCoverCollage (2fr+1fr grid, 最大3枚)
[ メタデータ ]
  ds-editorial "ALBUM"
  h1: album.title
  ds-caption: 期間ラベル + N枚
[ ページプレビュー ]
  3カラムグリッド (grid-cols-3) + 通し番号オーバーレイ
[ タイトル編集 ]
  AlbumTitleForm (client)
[ 写真を追加 ]
  Link → /pets/[petId]/album/[albumId]/add
[ 写真コントロール ]
  AlbumPhotoControls (client: リスト + ▲▼ + 外す + 並び順を保存)
[ アルバム削除 ]
  AlbumDeleteControl (client: confirm dialog)
```

**IDOR 防止:**
```typescript
supabase.from("albums")
  .eq("id", albumId)
  .eq("owner_user_id", user.id)   // owner check
  .eq("pet_id", petId)             // petId route match check
```

---

## 10. Cover

`AlbumCoverCollage` — ページローカル関数 (album detail / album TOP で同一実装):
- 1枚: `aspect-[4/3]` フル
- 2-3枚: `grid-cols-[2fr_1fr]` + `grid-rows-2` コラージュ

---

## 11. Page Preview

`grid-cols-3 gap-1.5` の写真グリッド。各セルに通し番号 (1-N) オーバーレイ表示。印刷レイアウトではなく「アルバムの並び」を確認するための editorial プレビュー。

---

## 12. タイトル編集

`AlbumTitleForm` (client component):
- `useActionState(updateAlbumTitle.bind(null, petId, albumId))`
- maxLength: 100
- 保存成功: "保存しました。" (success status)
- `revalidatePath` でアルバム TOP + 詳細ページを更新

---

## 13. Photo Add

ルート: `/pets/[petId]/album/[albumId]/add`

- Server Component: 認証 + album ownership + pet ownership
- `getPhotoPage` (primary scope, cursor-based pagination, PAGE_SIZE=24)
- album に既に含まれる photo_id を Set で保持 → "追加済み" 表示
- 各写真に `<form action={addAlbumPhoto.bind(null, petId, albumId, photo.id)}>` を個別設置
- IDOR: `addAlbumPhoto` 内で `photos.pet_id = petId AND uploader_user_id = user.id` を確認

---

## 14. Photo Remove

`removeAlbumPhoto(petId, albumId, photoId)`:
- `album_photos` のみ削除 (`DELETE WHERE album_id=X AND photo_id=Y`)
- `photos` テーブル・Storage に触れない
- `AlbumPhotoControls` でクライアント側即時 filter (楽観的 UI)

---

## 15. Reorder

`reorderAlbumPhotos(petId, albumId, formData)`:
- フォームの `photo_order` hidden input を 0-indexed で bulk 更新
- `supabase.rpc("reorder_album_photos", { p_album_id, p_positions })` — DB 側で ownership 検証
- クライアント側 `▲▼` ボタンでローカル配列を操作 → "並び順を保存" でまとめて送信

---

## 16. Album List

`/pets/[petId]/album` の棚セクション:
- `albums` を `(owner_user_id, pet_id, created_at DESC)` で最大 20 件取得
- 件数 > 0 → タイトル + 期間ラベルのリスト表示 (各行クリックで詳細ページへ)
- 件数 = 0 → 既存 `EmptyState` を維持

---

## 17. Draft 削除

`deleteAlbum(petId, albumId)`:
- `albums` を DELETE (`ON DELETE CASCADE` で `album_photos` も自動削除)
- `photos` テーブル / Storage は一切操作しない
- 削除後: `redirect(/pets/${petId}/album)`
- `AlbumDeleteControl` で確認ダイアログ + pending 中 disable

---

## 18. Primary Scope

Album は Task043 から引き続き `primary scope` を維持:
- `getPhotoPage(scope="primary")` → `get_pet_photos_page` RPC
- `photos.pet_id = album.pet_id` のみ対象
- Secondary relation 写真は自動選定しない

---

## 19. Security / IDOR

| チェック箇所 | 検証内容 |
|-------------|---------|
| `resolveAlbum(petId, albumId)` | `owner_user_id = user.id` + `pet_id = petId` 両方を `.eq()` で確認 |
| album detail page | `album.owner_user_id` + `album.pet_id = petId` |
| `addAlbumPhoto` | `photo.uploader_user_id = user.id` + `photo.pet_id = petId` |
| `reorder_album_photos` RPC | DB 側で `owner_user_id = auth.uid()` 検証 |
| add picker page | album ownership + pet ownership を独立検証 |
| UUID バリデーション | 全エントリポイントで UUID_PATTERN チェック |

albumId だけで取得しない。必ず `petId` との一致を確認。

---

## 20. Performance

| 対策 | 内容 |
|------|------|
| 写真候補 | `limit 200` でキャップ (全写真を取得しない) |
| AI 解析データ | テキストのみ参照 (画像をAIに送らない) |
| signed URL | 表示分のみ (`createListImageUrls`) |
| アルバム一覧 | サムネイルなし (タイトル + 期間テキストのみ) |
| picker | `getPhotoPage` cursor pagination PAGE_SIZE=24 |
| photo add | `upsert` で重複を silent ignore |

---

## 21. Mobile (390px)

- 写真コントロールリスト: `flex items-center gap-3` の行形式 — ▲▼ ボタンが `h-7 w-7 (28px)` + remove は `min-h-8` で 44px 未満
  - ▲▼ ボタンは操作補助なので 28px を許容 (primary action でない)
- ページプレビュー: `grid-cols-3` → 約 120px/セル (390px 基準)
- Bottom nav と重ならない: `app-page` の `pb-[calc(6rem+env(safe-area-inset-bottom))]` を layout.tsx が適用
- 期間選択: `grid-cols-2 gap-2` — 2列表示

---

## 22. Accessibility

| 項目 | 対応 |
|------|------|
| タイトル input | `htmlFor="album-title"` ラベル設定 |
| photo remove button | `aria-label="${photo.alt}をアルバムから外す"` |
| reorder ▲▼ button | `aria-label="${photo.alt}を1つ前/後ろに移動"` |
| カバー写真 | 装飾用 `alt=""`、ペット名 alt は1枚時のみ |
| `ds-focus` | 全 interactive 要素に focus-visible outline |
| `min-h-11` (44px) | 全 CTA ボタン・リンク |
| `aria-live="polite"` | 写真リスト (`aria-atomic="false"`) + status メッセージ |
| `aria-busy` | アルバム生成中ボタン |
| add picker | `aria-label="追加済み" / "この写真をアルバムに追加"` |
| delete confirm | `aria-labelledby="delete-album-heading"` |

---

## 23. Tests

ファイル: `tests/album.test.mjs`

| テスト ID | 内容 |
|----------|------|
| A | 空候補で空配列を返す |
| C | 候補からドラフト生成 (枚数チェック) |
| D | favorite 写真が選定されること |
| H | 1日最大 3 枚キャップ |
| (cap) | ALBUM_MAX_PHOTOS (35) キャップ |
| (diversity) | activity 多様性キャップ (最大 8) |
| (chrono) | 最終選定が時系列昇順 |
| N (fallback) | AI なしで generateFallbackTitle が正常動作 |
| N (month) | 1か月以内の期間で月名入りタイトル |
| B/I/J | resolveAlbum の petId 一致要件 (構造的テスト) |
| L (remove) | album_photos のみ削除 (構造的テスト) |
| L (delete) | ON DELETE CASCADE で photos/Storage 無傷 (構造的テスト) |

---

## 24. Migration dry-run

```
npx supabase db push --dry-run
→ Error: LegacyProjectNotLinkedError
  "Cannot find project ref. Have you run supabase link?"
```

プロジェクトが未リンク (Docker 未起動) のため実行不可。マイグレーション SQL は `20260918000001_albums.sql` に記述済み。既存マイグレーション (`20260915140000_add_photo_pets.sql`) と同フォーマットで記述。

---

## 25. typecheck / lint / build

```
npx tsc --noEmit
→ 3エラー (LayoutProps 未定義) — 変更前から存在する既存エラーのみ

npm run lint
→ exit 0 (エラー・警告なし)

npm run build
→ ✓ 全26ルートのbuildが成功
   新規: /pets/[petId]/album/[albumId]
         /pets/[petId]/album/[albumId]/add
   更新: /pets/[petId]/album/new
         /pets/[petId]/album

git diff --check
→ whitespace issue なし
```

---

## 26. git status --short

```
 M app/(app)/pets/[petId]/album/new/page.tsx
 M app/(app)/pets/[petId]/album/page.tsx
 M lib/supabase/database.types.ts
 M package-lock.json
 M package.json
?? .claude/
?? app/(app)/pets/[petId]/album/[albumId]/
?? app/(app)/pets/[petId]/album/new/actions.ts
?? app/(app)/pets/[petId]/album/new/album-create-form.tsx
?? docs/UCHINOCO_v1.1_UI_Design.pdf
?? lib/album-selection.ts
?? supabase/migrations/20260918000001_albums.sql
?? tests/album.test.mjs
```

(package-lock.json / package.json の変更は task043 以前から存在する pre-existing 変更)

---

## 27. Task045 への注意点

1. **`albums.status`** — Task044 では常に `'draft'`。`'ready'`/`'ordered'` を使う場合は意味を明確にしてから遷移ロジックを実装すること。

2. **印刷 / Checkout / Stripe** — 未実装。`/pets/[petId]/album/[albumId]` の CTA (現在は「写真を追加」のみ) に「注文する」ボタンを追加する際は、album.status を `'ready'` に変更するフロー + Stripe の checkout session を実装する。

3. **AlbumCoverCollage** — 現在 `album/page.tsx` と `[albumId]/page.tsx` に同一コードが 2 箇所存在。Task045 で印刷プレビューなどに使う場合、`app/(app)/pets/[petId]/album/_components/album-cover-collage.tsx` に抽出を検討。

4. **`cover_photo_id`** — albums テーブルには `cover_photo_id` 列があるが、現在はカバー表示に使っていない (先頭 3 枚を使用)。Task045 でカバー写真選択機能を実装する際に使用。

5. **`reorder_album_photos` RPC** — `security invoker` で `auth.uid()` を検証。RPC の結果は `undefined` を返す — `data` が null でも正常完了とみなす実装になっている。エラー判定は `error` プロパティのみ確認すること。

6. **写真追加ピッカー** — 現在 `getPhotoPage` (全写真を期間フィルタなしで表示)。大量写真ユーザーでは遅くなる可能性。Task045 で period フィルタや AI タグ検索に対応する場合は検索ページのコンポーネントを参考にすること。

7. **DB migration 適用** — `npx supabase link` → `npx supabase db push` の手順でリモートに適用。適用前に `npx supabase db push --dry-run` で確認推奨。
