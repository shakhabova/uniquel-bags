import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { OrderPhoto } from "@/components/order-photo";
import { database } from "@/lib/store";
import { money } from "@/lib/products";
import type { Order } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ваш заказ — UNIQUEL BAGS",
  robots: { index: false, follow: false },
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
  )
    notFound();
  const row = database()
    .prepare("SELECT data FROM orders WHERE id = ?")
    .get(id) as { data: string } | undefined;
  if (!row) notFound();
  const order = JSON.parse(row.data) as Order;
  return (
    <main className="shell order-page">
      <header>
        <Logo />
        <Link href="/">В каталог →</Link>
      </header>
      <section className="order-heading">
        <p className="eyebrow">UNIQUEL BAGS · ВАШ ВЫБОР</p>
        <h1>Ваш заказ</h1>
        <p>
          № {order.id.slice(0, 8)} ·{" "}
          {new Intl.DateTimeFormat("ru-RU", {
            dateStyle: "long",
            timeZone: "Europe/Moscow",
          }).format(new Date(order.createdAt))}
        </p>
        <p>
          Состав и цены сохранены на момент создания заказа. Наличие и доставку
          подтвердим в WhatsApp.
        </p>
      </section>
      <div className="order-items">
        {order.items.map((item) => (
          <article
            className="order-item"
            key={JSON.stringify([item.productId, item.color])}
          >
            <OrderPhoto
              src={item.image}
              alt={item.name + (item.color ? " · " + item.color : "")}
            />
            <div>
              <h2>{item.name}</h2>
              <p>{item.color ? "Цвет: " + item.color : "Цвет не указан"}</p>
              <p>
                {money(item.price)} × {item.quantity} шт.
              </p>
              <strong>{money(item.subtotal)}</strong>
            </div>
          </article>
        ))}
      </div>
      <section className="order-summary">
        <span>Итого</span>
        <strong>{money(order.total)}</strong>
        <p>Стоимость доставки уточняется отдельно.</p>
      </section>
    </main>
  );
}
