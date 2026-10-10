import { ALBUM_PAGE_COUNTS, type AlbumPageCount } from "./album-capacity.ts";
export type AlbumSetup = { petIds: string[]; pageCount: AlbumPageCount; from: Date; to: Date; label: string };
export function parseAlbumSetup(form: FormData, ownedPetIds: string[], now=new Date()): AlbumSetup {
  const all = form.get("petSelection") == null || form.get("petSelection") === "all";
  const petIds = all ? ownedPetIds : [...new Set(form.getAll("petIds").map(String))];
  if (!petIds.length || petIds.some(id=>!ownedPetIds.includes(id))) throw new Error("アルバムに含めるペットを選択してください。");
  const pageCount=Number(form.get("pageCount") ?? 48) as AlbumPageCount;
  if (!ALBUM_PAGE_COUNTS.includes(pageCount)) throw new Error("24・48・72Pからページ数を選択してください。");
  const period=String(form.get("period") ?? "3months");
  const to=new Date(now), from=new Date(now);
  const labels: Record<string,string>={"3months":"最近3か月","6months":"最近半年","1year":"最近1年",all:"すべて",custom:"指定期間"};
  if (!labels[period]) throw new Error("対象期間を選択してください。");
  if (period==="custom") {
    const start=String(form.get("periodFrom") ?? ""), end=String(form.get("periodTo") ?? "");
    const valid=(v:string)=> /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
    if (!valid(start) || !valid(end) || start>end) throw new Error("開始日と終了日を正しく指定してください。");
    from.setTime(Date.parse(`${start}T00:00:00+09:00`)); to.setTime(Date.parse(`${end}T23:59:59.999+09:00`));
  } else if (period==="all") from.setTime(0);
  else if (period==="1year") from.setFullYear(from.getFullYear()-1);
  else from.setMonth(from.getMonth()-(period==="6months"?6:3));
  return {petIds,pageCount,from,to,label:labels[period]};
}
