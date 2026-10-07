# Task068 — Anniversary & Growth Memories

## Summary

誕生日、お迎え日、過去の同月同日写真を保存済みデータだけで検出し、UCHINOCO NOWとペット単位の記念日ページへ接続した。推測した日付・年齢・イベントは生成せず、新規Vision callも行わない。

## Anniversary logic

- `pets.birthday` / `pets.adoption_date` の有効な日付だけをJSTの当日月日と比較する。
- 誕生日とお迎え記念日はUCHINOCO NOWのpriority 1を維持する。
- お迎え年数は保存日付の年と現在年の差だけを表示する。
- all-pet表示ではイベント件数ではなく対象ペットのdistinct件数を表示し、CTAは代表ペットの認可済み記念日ページへ向ける。
- 日付がない場合や一致しない場合は記念日を表示しない。

## On This Day

- JST 00:00〜翌日00:00の範囲を、1年前から10年前まで年ごとに検索する。
- `taken_at`を先に検索し、nullの場合は同じ範囲の`created_at`へフォールバックする既存helperを利用する。
- 各年最大6枚、当日最大12枚に制限し、全写真取得を行わない。
- 過去の完全な同月同日写真がない場合は表示しない。

## Growth comparison

- 同じペットの「過去の同日写真」と「今日の写真」だけを比較候補にする。
- 保存済みPhoto IntelligenceとSubject Geometryの現行versionだけを使用する。
- 両写真でペットが確認でき、orientationが一致し、quality scoreが双方55以上の場合だけ候補化する。
- 条件を満たさない場合は比較を無理に表示しない。
- Before / Afterはprivate Storageのthumbnail優先signed URLで一括取得する。

## UI and album connection

- `/pets/[petId]/anniversary` を追加した。
- 成長比較、年ごとの同日写真、保存済み誕生日／お迎え日を表示する。
- 写真は既存詳細へリンクする。
- 「この日の思い出をアルバムにする」は既存`/pets/[petId]/album/new`へ接続し、専用生成基盤は追加していない。
- 既存Annual Candidateは既に保存済みbirthday/adoption metadataをevent emphasisへ渡しており、その挙動とmaterialized annual draftの不変性を維持した。

## Security and multi-pet

- ペット配下のowner authorization layoutに加え、記念日ページ自身でも`auth.getUser()`と`owner_user_id`を検証する。
- 写真queryは選択中かつ所有済みのpet IDsだけを使用し、RLSを維持する。
- 成長比較は同一pet ID同士に限定する。
- service role、public URL、signed URLのDB保存は使用しない。

## Analytics

Task068では新しいanalytics eventを追加していない。既存album analytics schemaへ不自然に結合せず、pet name、photo ID、caption、path、signed URLをイベントへ保存しない方針を優先した。

## Validation

- `node --experimental-strip-types --test tests/*.test.mjs`: 920 passed / 0 failed
- `npx tsc --noEmit`: passed
- scoped ESLint: passed
- `npm run build`: passed (Next.js 16.3.5 / webpack)
- `git diff --check`: passed
- migration: none

## Remaining issues

- 同日探索は現在、過去10年を上限としている。通常のペットライフサイクルを十分に覆いつつquery数を制限するための上限であり、将来より長期間を扱う場合は設定値化またはDB関数化を検討できる。
- 成長比較は「今日の写真」が存在し、保存済み解析が揃った場合だけ表示する。近近日を現在写真として補完する処理や新規解析は行っていない。
- analytics計測は未追加。将来専用のprivacy-safeなNOW analytics境界が整った場合にaggregate eventのみ追加できる。

## Git

commit / pushは実施していない。
