import { listProducts, database } from "@/lib/store";
import { validateProduct, type Product } from "@/lib/products";
import { authorize, isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const all = new URL(request.url).searchParams.get("all") === "1";
    if (all && !(await isAdmin())) {
      return Response.json({ error: "Нет доступа" }, { status: 403 });
    }
    return Response.json(await listProducts(all), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Не удалось загрузить каталог. Попробуйте ещё раз." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  let data;
  try {
    data = validateProduct(await request.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Некорректные данные" },
      { status: 400 },
    );
  }

  try {
    const product: Product = {
      ...data,
      id: crypto.randomUUID(),
      archived: false,
      createdAt: new Date().toISOString(),
    };
    database()
      .prepare("INSERT INTO products (id, data, archived) VALUES (?, ?, 0)")
      .run(product.id, JSON.stringify(product));
    return Response.json(product, { status: 201 });
  } catch {
    return Response.json(
      { error: "Не удалось сохранить товар" },
      { status: 503 },
    );
  }
}
