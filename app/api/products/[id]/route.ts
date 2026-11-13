import { database } from "@/lib/store";
import { validateProduct } from "@/lib/products";
import { authorize } from "@/lib/admin";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorize(request);
  if (denied) return denied;
  const { id } = await params;

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
    const db = database();
    const row = db
      .prepare("SELECT data, archived FROM products WHERE id = ?")
      .get(id) as { data: string; archived: number } | undefined;
    if (!row)
      return Response.json({ error: "Товар не найден" }, { status: 404 });

    const old = JSON.parse(row.data);
    const product = {
      ...data,
      id,
      createdAt: old.createdAt,
      archived: Boolean(row.archived),
    };
    db.prepare("UPDATE products SET data = ? WHERE id = ?").run(
      JSON.stringify(product),
      id,
    );
    return Response.json(product);
  } catch {
    return Response.json(
      { error: "Не удалось обновить товар" },
      { status: 503 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await authorize(request);
  if (denied) return denied;
  const { id } = await params;

  let archived: boolean;
  try {
    const body = (await request.json()) as { archived?: unknown };
    if (typeof body.archived !== "boolean") throw new Error();
    archived = body.archived;
  } catch {
    return Response.json({ error: "Некорректный статус" }, { status: 400 });
  }

  try {
    const result = database()
      .prepare("UPDATE products SET archived = ? WHERE id = ?")
      .run(archived ? 1 : 0, id);
    if (!result.changes)
      return Response.json({ error: "Товар не найден" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Не удалось изменить статус" },
      { status: 503 },
    );
  }
}
