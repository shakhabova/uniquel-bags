import { sameOrigin } from "@/lib/admin";
import { database, listProducts } from "@/lib/store";
import {
  snapshotOrderItems,
  orderTotal,
  orderMessage,
  type Order,
} from "@/lib/orders";
import type { Product } from "@/lib/products";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Недопустимый источник запроса" },
      { status: 403 },
    );
  }

  let products: Product[];
  try {
    products = await listProducts();
  } catch {
    return Response.json(
      { error: "Не удалось загрузить каталог. Попробуйте ещё раз" },
      { status: 503 },
    );
  }

  let items;
  try {
    const text = await request.text();
    if (text.length > 20000) throw new Error("Слишком большая корзина");
    const body = JSON.parse(text) as { items?: unknown } | null;
    items = snapshotOrderItems(body?.items, products);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Проверьте корзину" },
      { status: 400 },
    );
  }

  try {
    const order: Order = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      items,
      total: orderTotal(items),
    };
    database()
      .prepare("INSERT INTO orders (id, data) VALUES (?, ?)")
      .run(order.id, JSON.stringify(order));
    const url = new URL(
      "/orders/" + order.id,
      process.env.APP_URL || new URL(request.url).origin,
    ).href;
    const whatsappUrl =
      "https://wa.me/79332152529?text=" +
      encodeURIComponent(orderMessage(order, url));
    return Response.json(
      { url, whatsappUrl },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Не удалось сохранить заказ. Попробуйте ещё раз" },
      { status: 503 },
    );
  }
}
