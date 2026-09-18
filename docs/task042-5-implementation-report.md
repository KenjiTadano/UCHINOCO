# UCHINOCO v1.1 Task042-5 実装報告書

## 概要

| 項目 | 内容 |
|------|------|
| タスク | Task042-5: UI照合・デザイン品質向上 (UI Polish) |
| ブランチ | `feature/task042-5-ui-polish` |
| 基点コミット | `e4d3f5f` (task42-4完了) |
| 実施日 | 2026-09-18 |
| 種別 | UI polish / デザイン品質向上（新機能追加なし） |

---

## 実施目的

既存実装をUCHINOCOのHi-Fiデザイン方針へ照合し、以下のコンセプトへ寄せる。

**「デジタルの中にある、上質な家族のフォトブック」**

キーワード: PHOTO FIRST / WARM MINIMAL / EDITORIAL / EFFORTLESS / MEMORIES OVER DATA

既存機能（routing / Server Actions / RLS / pagination / thumbnail / signed URL / AI / search / relation / favorite / upload）は一切壊さない。

---

## 変更ファイル一覧

```
11 files changed, 98 insertions(+), 184 deletions(-)
```

| ファイル | 種別 | 変更の主旨 |
|----------|------|-----------|
| `app/globals.css` | デザインシステム | app-section-title縮小、app-title太さ調整、app-description定義 |
| `app/_components/ui/index.tsx` | デザインシステム | MemoryDateHeader・EmptyState polish |
| `app/(app)/home/page.tsx` | ページ | ヘッダー・ペットカード・logout全面polish |
| `app/(app)/pets/[petId]/page.tsx` | ページ | back link修正、pet info簡素化、ボタン統合 |
| `app/(app)/pets/[petId]/photos/[photoId]/page.tsx` | ページ | 写真主役化、メタデータ軽量化、ヘッダー除去 |
| `app/(app)/pets/[petId]/photos/[photoId]/photo-edit-controls.tsx` | コンポーネント | FavoriteButtonスタイル統一 |
| `app/(app)/pets/[petId]/photos/new/photo-upload-form.tsx` | コンポーネント | AI表現の柔和化 |
| `app/(app)/search/_components/search-controls.tsx` | コンポーネント | AI進捗数値・scope note除去 |
| `app/(app)/search/_components/search-screen.tsx` | コンポーネント | EmptyState統一 |
| `app/(app)/pets/[petId]/favorites/page.tsx` | ページ | EmptyState統一 |
| `app/(app)/_components/pet-action-selector.tsx` | コンポーネント | back link表記修正 |

---

## 画面別 改善詳細

### 1. Home (`/home`)

**目的**: 「思い出の入口」へ。Dashboard感・管理UI感を除去。

#### ヘッダー

| 変更前 | 変更後 |
|--------|--------|
| `text-2xl font-bold tracking-tight text-primary` (太字オレンジ) | `text-sm font-semibold tracking-[0.12em] text-foreground` (小さく、editorial tracking) |
| ユーザー名を別行で表示 | ヘッダー右端にインライン配置（変更なし） |
| タグライン「うちの子との毎日を、思い出に。」あり | 除去（Hero写真セクションが感情的文脈を担う） |

#### ペットカード

| 変更前 | 変更後 |
|--------|--------|
| アバター `size-16 sm:size-18` | `size-14`（コンパクト化） |
| 種類・犬種・性別・誕生日・お迎え日 (5行のメタデータ) | 種類・犬種 (1行のみ) |
| 「思い出を見る」「写真を追加」「編集」の3ボタン | 「思い出を見る」(primary flex-1) + 「写真を追加」(secondary) の2ボタン |
| 「編集」app-button-ghost | カード右上の xs テキストリンクに降格 |
| ＋ペット追加: `app-button-ghost min-h-11` | xs テキストリンク（極小） |

#### その他

- 「最新N件」カウンター削除（統計情報を除去）
- `app-empty` div → `EmptyState` コンポーネントに統一
- ログアウト: `app-button-ghost` ボタン → centered xs テキストリンク（最下部）

---

### 2. 思い出 (`/pets/[petId]`)

**目的**: 写真集・ライフスタイル誌らしいeditorial UIを維持・強化。

| 変更前 | 変更後 |
|--------|--------|
| "homeへ戻る" | "ホームへ戻る"（表記統一） |
| ペット情報: `dl` (種類/犬種・猫種/誕生日 の3行テーブル) | `<p class="text-xs text-muted">` 1行（「犬・ゴールデン　2019年3月1日生まれ」） |
| 「プロフィールを編集」: `app-back-link` スタイル | xs テキストリンク（`decoration-border`） |
| 「アルバムを見る」専用行 + 「思い出を検索」「写真を追加」行（2行） | 「探す」「アルバム」(ghost) + 「写真を追加」(primary) を1行に統合 |
| `app-empty` div | `EmptyState` コンポーネント |

---

### 3. 写真追加 (`/pets/[petId]/photos/new`)

**目的**: 「簡単に写真を入れる」体験の維持。技術用語を露出しない。

| 変更前 | 変更後 |
|--------|--------|
| 「追加した写真は**外部AIサービス**で自動的に整理され、説明やタグが付きます。」 | 「追加後に自動的に整理されます。」 |

構造・CTA・プレビュー・remove・favorite・upload状態・error表示は変更なし。

---

### 4. 探す (`/search`)

**目的**: 「言葉を考えなくても思い出を見つけられる」体験を維持。

| 変更前 | 変更後 |
|--------|--------|
| 「写真から見つけた言葉」+ 「X / Y枚を整理済み」(右端) | 「写真から見つけた言葉」のみ（AI処理進捗数値を削除） |
| 「件数はこの子の/すべての写真が対象です。」サブノート | 削除 |
| 結果0件: `app-empty` div + `app-button-ghost` | `EmptyState` コンポーネント |

chipグルーピング・選択状態・件数表示・ページネーション・お気に入りフィルターは変更なし。

---

### 5. Photo Detail (`/pets/[petId]/photos/[photoId]`)

**目的**: 写真を最優先。情報が同じ強さで並ばないようにする。

#### 視覚的優先順位の調整

```
変更前の積み重ね:
1. Back link
2. [eyebrow: ペット名] + [h1: 思い出写真]  ← 冗長
3. 写真 (border + 白背景)
4. dl.app-card-flat (撮影日時 / お気に入り / キャプション)
5. PhotoPetControls (app-card-flat)
6. PhotoEditControls (app-card-flat: 見出し+3フォーム)
7. AI解析セクション (app-card-flat)
8. PhotoDeleteControl (border-t区切り)

変更後の積み重ね:
1. Back link
2. 写真 (ボーダーなし / warm ivory bg)  ← 主役へ
3. 撮影日時 (xs text-muted) + キャプション (存在時のみ)  ← 軽量
4. PhotoPetControls (変更なし)
5. PhotoEditControls (見出し軽量化 / favorite button統一)
6. 「写真の情報」セクション (AI情報)
7. PhotoDeleteControl (変更なし)
```

#### 変更詳細

| 変更前 | 変更後 |
|--------|--------|
| `<h1 class="app-title">思い出写真</h1>` + eyebrow あり | 削除（back linkで十分なコンテキスト） |
| `app-photo-frame aspect-square border bg-surface` | `app-photo-frame aspect-square`（borderと白背景override除去） |
| `dl.app-card-flat`（撮影日時・お気に入り・キャプション） | `div.grid.gap-3.px-1`（撮影日時xs・キャプション存在時のみ） |
| 「お気に入り」テキスト表示 | 削除（編集フォームのFavoriteButtonで担う） |
| キャプション「未設定」プレースホルダー | 削除（編集で追加できることは編集フォームで自明） |
| AI見出し「写真の整理」 | 「写真の情報」（neutral表現） |
| AI説明「外部AIサービスで自動的に整理され...」 | 削除（サービス内部情報の露出を防ぐ） |

#### お気に入りボタン統一 (photo-edit-controls.tsx)

```
変更前: app-button-secondary w-full border-favorite/40 bg-favorite-soft text-favorite
        ★ お気に入り済み / ☆ お気に入り

変更後: FavoriteButtonと同一スタイル
        ds-focus inline-flex min-h-11 w-fit items-center gap-2
        rounded-full border px-4 text-sm font-medium transition-colors
        + aria-label 追加
```

---

### 6. Bottom Navigation

構造・アイコン・サイズ・FABデザインは既存が適切なため変更なし。

確認済み項目:
- `size-12` FAB circle (48px) — 標準的なサイズ
- `border-4 border-background` の浮き上がり表現 — 維持
- `style={{ paddingBottom: "env(safe-area-inset-bottom)" }}` — iPhone bottom inset 対応
- `pb-[calc(6rem+env(safe-area-inset-bottom))]` — コンテンツとの重なり防止 (layout.tsx)
- active state: `bg-brand-terracotta-soft text-brand-terracotta-strong` — 維持

---

## Design System 変更

### globals.css

```css
/* 変更 */
.app-section-title {
  /* 変更前: text-xl font-semibold */
  @apply text-lg font-semibold tracking-tight text-foreground;
}

.app-title {
  /* 変更前: font-bold */
  @apply mt-1 text-2xl font-semibold tracking-tight text-foreground;
}

/* 新規追加 */
.app-description {
  @apply text-sm leading-relaxed text-muted;
}
```

### ui/index.tsx — MemoryDateHeader

```tsx
// 変更前
<header className="flex items-baseline justify-between gap-3 border-b pb-2">
  <h2 className="ds-editorial">{date}</h2>
  {count}枚の思い出
</header>

// 変更後
<header className="mb-3 flex items-baseline justify-between gap-3">
  <h2 className="ds-editorial">{date}</h2>
  {count}枚  {/* 短縮 */}
</header>
```

### ui/index.tsx — EmptyState

```tsx
// 変更前
<section className="rounded-[20px] border border-dashed bg-surface/70 px-6 py-10 text-center">
  <h2 className="ds-heading text-lg">{title}</h2>

// 変更後
<section className="px-4 py-10 text-center">
  <h2 className="text-base font-medium text-foreground">{title}</h2>
```

border-dashed・bg-surface/70 を除去し、空状態をerror画面のように見せない。

---

## コンポーネント再利用実績

| コンポーネント | 利用箇所 |
|--------------|---------|
| `EditorialPhotoGrid` | Home(hero/recent/favorites)・思い出 |
| `MemoryDateHeader` | 思い出・お気に入り(月別) |
| `PageHeader` | Home(hero section)・思い出・探す |
| `SegmentControl` | 思い出(すべて/お気に入り切替) |
| `EmptyState` | Home(pet/recent/favorite)・思い出・お気に入り・Search |
| `FavoriteButton` | 写真追加(各写真プレビュー) |
| `SearchChip` | 探す(pet/tag/scene/activity/emotion/favorite) |
| `PhotoCard` | EditorialPhotoGrid内部 |
| `TagChip` | Photo Detail(AIタグ表示) |

新規コンポーネント: なし

---

## 検証結果

### typecheck

```
npx tsc --noEmit
→ 3エラー (LayoutProps 未定義) — 変更前から存在する既存エラー、今回の変更と無関係
```

### lint

```
npm run lint
→ exit 0 (エラーなし)
```

### build

```
npm run build --webpack
→ ✓ 全22ルートのbuildが成功
```

### git diff --check

```
→ whitespace issueなし
```

### tests

```
node --test tests/*.mjs
→ 2失敗 (TypeScript loader未設定の既存問題) — 変更前から同一の失敗
```

---

## リグレッション確認

### 機能単位

| 機能 | 確認 | 変更の有無 |
|------|------|-----------|
| routing (全画面) | ✅ | なし |
| Server Actions (upload/favorite/caption/takenAt/delete) | ✅ | なし |
| RLS (pet ownership チェック) | ✅ | なし |
| pagination (before/beforeId cursor) | ✅ | なし |
| thumbnail生成・表示 | ✅ | なし |
| signed URL (pet-photos/pet-photo-thumbnails/pet-avatars) | ✅ | なし |
| AI解析 (photo_ai_analyses) | ✅ | なし |
| search (facets/keyword/pet/word/favorite/date) | ✅ | なし |
| relation (photo_pets add/remove) | ✅ | なし |
| favorite toggle | ✅ | なし |
| photo upload (HEIC変換/重複チェック/並列アップロード) | ✅ | なし |

### 画面遷移

| 遷移 | 変更前後 |
|------|---------|
| `/home` → `/pets/[petId]` | 維持 |
| `/pets/[petId]` → `/pets/[petId]/photos/new` | 維持 |
| `/pets/[petId]` → `/pets/[petId]/photos/[photoId]` | 維持 |
| `/pets/[petId]/photos/[photoId]` → `/pets/[petId]` | 維持 |
| `/photos/new` → pet選択 → `/pets/[petId]/photos/new` | 維持 |
| Bottom nav: `/home` / `/memories` / `/search` / `/album` | 維持 |

---

## Accessibility

変更後も以下を維持:

| 項目 | 確認 |
|------|------|
| `min-h-11` (44px) 全 interactive 要素 | ✅ |
| `ds-focus` (focus-visible outline) 全 interactive 要素 | ✅ |
| `aria-current` nav・segment control | ✅ |
| `aria-label` 全ボタン・リンク | ✅ |
| `aria-pressed` favorite・search chip | ✅ |
| `aria-live` / `aria-atomic` 動的コンテンツ | ✅ |
| `aria-busy` ローディング中 | ✅ |
| heading hierarchy (h1→h2→h3) | ✅ |
| color contrast (terracotta-strong on surface) | ✅ |

追加: `photo-edit-controls.tsx` の favorite ボタンに `aria-label` を追加。

---

## Mobile / Desktop 確認

### 390px (iPhone 15 基準)

- `app-page max-w-xl` + `px-4` でコンテンツ収まりを確認
- ペットカード: `flex gap-2` でボタン2つが収まる (各ボタン ~175px)
- Bottom nav: `grid-cols-5` + `h-16` = 各セル ~78px × 20px height → 適切
- 長いペット名: `truncate` で対応済み
- 長いキャプション: `whitespace-pre-wrap break-words` で対応済み

### 1280px (Desktop)

- `max-w-xl` (672px) センタリング確認
- Editorial photo grid の `grid-cols-[1.25fr_0.75fr]` が widescreenでも成立

---

## Task043 引き継ぎ事項

Task043: Album TOP 実装に向けた注意点

1. **Album ページは今回無変更**: `/album` / `/pets/[petId]/album` は Task043 で実装。
2. **再利用推奨コンポーネント**:
   - `EmptyState` — Album空状態に使用（border-dashed除去済みのシンプル版）
   - `MonthPhotoGrid` — `variant="classic"` で月別3カラムグリッド表示が可能
   - `SegmentControl` — 「すべて」「月別」等のタブ切替に利用可能
   - `app-section-title` — `text-lg font-semibold`（今回変更済みのサイズで統一）
3. **app-description クラス**: 今回定義済み。Album説明テキストに使用可能。
4. **MemoryDateHeader のスタイル変更**: `border-b` 除去済み・カウント「枚」短縮済み。Album でも同コンポーネントを使用する場合はこのスタイルで統一。
5. **避けるべき点**: Album でもカードUI / border / shadow を過剰に使わない。写真を主役にするデザイン方針を継続。

---

## 変更方針サマリー

| 方針 | 具体的な変更 |
|------|------------|
| PHOTO FIRST | ヘッダー/メタデータ/ボタンのサイズ縮小、写真フレームのborder除去 |
| WARM MINIMAL | EmptyStateのdashed border除去、border-b除去、ログアウトをテキストリンクに |
| EDITORIAL | MemoryDateHeader border除去、UCHINOCOロゴをeditoril tracking に |
| EFFORTLESS | ペット情報3行→1行、ボタン3→2、重複メタデータ除去 |
| MEMORIES OVER DATA | AI進捗数値除去、scope note除去、誕生日除去、「外部AIサービス」表現除去 |
