# UCHINOCO Task050.3.1 Implementation Report

## Task概要

Task050.3のAlbum-wide Layout Rhythmに対する局所調整。候補差が小さい場合だけ、同一layoutの長期連続からalternativeへescapeさせる。

強いlayout、STRICT tier、crop/frame compatibilityはrhythmだけで逆転させない。

## 変更ファイル

- `lib/album-draft/rhythm.ts`
- `lib/album-draft/draft.ts`
- `lib/album-draft/types.ts`
- `app/(app)/dev/album-draft/album-draft-lab.tsx`
- `tests/album-draft.test.mjs`

## 実装内容

- 同一layout IDのrepeat streakを計算
- 同tier alternativeとのbase score gapを計算
- 同一layoutが3spread以上連続し、候補差が3点以内の場合のみ4回目以降のescape penaltyを適用
- 同一layout IDのpenaltyを同family別layoutより強く設定
- 2連続、3連続、4回目以降のprogressive penaltyを追加
- 最大rhythm補正は既存の`-8 / +4`を維持
- `heroConfidence`をAlbum Draft Debugへ伝播
- Debug UIに以下を表示
  - Layout ID
  - Layout Family
  - Rhythm adjustment
  - Repeat count
  - Candidate gap
  - Recent families
  - Hero confidence

## 設計判断

- ranking層でbase scoreとcandidate gapを比較
- tier rankingを先に適用し、`STRICT > FALLBACK > UNUSABLE`を維持
- large score gapではescape penaltyを追加しない
- contextなしでは既存Task050.2挙動を維持
- Smart Layout core、DB層、AI解析経路は変更なし
- randomを使わず、同一inputから同一結果を生成

Score gap thresholdは既存score scaleに合わせて3点以内とした。

## Before / After

### Small-gap escape

Candidate:

- L05: 82
- L08: 80

結果:

- Before: `L05 -> L05 -> L05 -> L05`
- After: `L05 -> L05 -> L05 -> L08`

### Strong layout protection

- L07: 95
- L06: 86

L07はrhythm適用後も維持され、rhythmだけで逆転しないことを確認した。

### 実Case C

実写真fixtureでは4回目のcandidate ranking上、L05よりL11/L04が上昇したが、既存gateで不採用となり最終draftはL05を維持した。crop/frame compatibilityを優先する既存挙動であり、無理なlayout変更は行っていない。

## Regression

以下を維持。

- Task050.1 Orientation Affinity
- Hierarchy Fit
- Weak Photo handling
- Task050.2 Photo Intelligence / Best Shot
- heroSuitability / heroConfidence
- Task050.3 family rhythm
- density rhythm
- orientation rhythm
- contextなしfallback
- STRICT優先
- deterministic sequence

## Tests

関連テスト合計: **86/86 pass**

対象:

- `tests/smart-layout.test.mjs`
- `tests/best-shot.test.mjs`
- `tests/album-draft.test.mjs`
- `tests/album-generation.test.mjs`
- `tests/album-story.test.mjs`

追加確認:

- small-gap repetition escape
- strong layout protection
- same family / different ID penalty
- STRICT protection
- contextなし
- determinism
- progressive penalty
- 10-spread fixture

## TypeScript

`npx tsc --noEmit`: **success**

## Build

`npm run build`: **success**

## Lint

変更範囲Lint: **success**

## git diff --check

**success**

## git status

既存の未commit変更を保持。Task050.3.1の変更も未commit状態。

作業ツリーにはTask050以前からの既存変更・生成成果物も含まれる。

## 残課題

- 実ブラウザのAlbum Draft生成は既存データの5MB超画像により完走しないケースがある
- 実写真Case Cはcandidate rankingではescapeするが、既存gateにより最終layoutが維持される
- rhythm debugの実ブラウザ確認はデータ生成エラーのため限定的

## commit / push状態

- commit: **未実施**
- push: **未実施**
