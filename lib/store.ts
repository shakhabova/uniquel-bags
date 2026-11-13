import { getDb } from "@/db";
import { samples, type Product } from "./products";

type ProductRow = { id: string; data: string; archived: number };

export function database() {
  return getDb();
}

export async function listProducts(includeArchived = false) {
  const db = database();
  const count = db.prepare("SELECT COUNT(*) AS count FROM products").get() as {
    count: number;
  };
  if (count.count === 0) await seedSamples();

  const where = includeArchived ? "" : " WHERE archived = 0";
  const rows = db
    .prepare(
      `SELECT id, data, archived FROM products${where}
       ORDER BY json_extract(data, '$.createdAt') DESC, rowid DESC`,
    )
    .all() as unknown as ProductRow[];

  return rows.map((row) => ({
    size: "",
    ...JSON.parse(row.data),
    archived: Boolean(row.archived),
  })) as Product[];
}

export async function seedSamples() {
  const db = database();
  const insert = db.prepare(
    "INSERT OR IGNORE INTO products (id, data, archived) VALUES (?, ?, 0)",
  );
  for (const product of samples)
    insert.run(product.id, JSON.stringify(product));
}
