import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/photobook-products";
import {
  getOrderStatusLabel,
  getShortOrderId,
  formatOrderDate,
  getOrderDisplayTitle,
} from "@/lib/order-helpers";

export default async function AccountOrdersPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/login");

  // Owner filter is enforced by RLS + explicit .eq() double-check
  const { data: rawOrders, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "id, album_title_snapshot, product_name, product_size, product_cover_type_label, pages, total, status, created_at, cover_original_path_snapshot, pet_id, album_id",
    )
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const orders = rawOrders ?? [];

  // Pet names for display
  const petIds = [...new Set(orders.map((o) => o.pet_id))];
  const { data: petsData } = await supabase
    .from("pets")
    .select("id, name")
    .in("id", petIds.length > 0 ? petIds : ["00000000-0000-0000-0000-000000000000"]);
  const petNameById = new Map((petsData ?? []).map((p) => [p.id, p.name]));

  // Signed URLs for cover images (pet-photos private bucket)
  const coverPaths: string[] = [];
  for (const o of orders) {
    if (o.cover_original_path_snapshot) coverPaths.push(o.cover_original_path_snapshot);
  }

  const coverUrlMap = new Map<string, string>();
  if (coverPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage
      .from("pet-photos")
      .createSignedUrls(coverPaths, 3600);
    for (const item of signedUrls ?? []) {
      const url = item.signedUrl;
      const p = item.path;
      if (url && p) coverUrlMap.set(p, url);
    }
  }

  return (
    <main className="app-page">
      <Link className="app-back-link" href="/album">
        アルバムへ戻る
      </Link>

      <header>
        <p className="ds-editorial">ORDER HISTORY</p>
        <h1 className="mt-1 text-xl font-semibold">注文履歴</h1>
      </header>

      {ordersErr && (
        <p role="alert" className="app-error">
          注文履歴を取得できませんでした。
        </p>
      )}

      {!ordersErr && orders.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-muted">まだ注文したフォトブックはありません</p>
          <Link
            href="/album"
            className="app-button-secondary mx-auto mt-6 inline-flex"
          >
            アルバムを見る
          </Link>
        </div>
      )}

      {orders.length > 0 && (
        <ul className="grid gap-5">
          {orders.map((order) => {
            const coverUrl = order.cover_original_path_snapshot
              ? coverUrlMap.get(order.cover_original_path_snapshot)
              : undefined;
            const title = getOrderDisplayTitle(order.album_title_snapshot, null);
            const petName = petNameById.get(order.pet_id);
            const shortId = getShortOrderId(order.id);
            const statusLabel = getOrderStatusLabel(order.status);
            const dateStr = formatOrderDate(order.created_at);
            const isFinalised = order.status === "paid";

            return (
              <li key={order.id}>
                <Link
                  href={`/pets/${order.pet_id}/album/${order.album_id}/order/${order.id}`}
                  className="ds-focus group flex gap-4 rounded-2xl bg-surface p-4 transition-opacity hover:opacity-90"
                  aria-label={`${title} ${statusLabel}`}
                >
                  {/* Book cover */}
                  <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-sm bg-surface-warm shadow-[1px_2px_4px_0_rgba(0,0,0,0.10)]">
                    {coverUrl ? (
                      <Image
                        src={coverUrl}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="size-full bg-surface-warm" />
                    )}
                    {/* Book spine */}
                    <div
                      className="absolute inset-y-0 left-0 w-1.5 bg-black/[0.08]"
                      aria-hidden="true"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="grid gap-0.5">
                      {petName && (
                        <p className="ds-caption">{petName}</p>
                      )}
                      <p className="truncate font-semibold leading-snug">{title}</p>
                      <p className="ds-caption">
                        {order.product_name}　{order.pages}ページ
                      </p>
                    </div>
                    <div className="mt-2 flex items-end justify-between">
                      <div className="grid gap-0.5">
                        <p className="ds-caption">{shortId}</p>
                        <p className="ds-caption">{dateStr}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatPrice(order.total)}</p>
                        <p
                          className={`mt-0.5 text-xs ${
                            isFinalised
                              ? "text-success"
                              : order.status === "pending"
                                ? "text-muted"
                                : "text-danger/70"
                          }`}
                        >
                          {statusLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
