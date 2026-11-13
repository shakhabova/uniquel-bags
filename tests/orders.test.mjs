import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const context = vm.createContext({});
const modules = new Map();
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = await fs.readFile(
    new URL("../lib/" + name + ".ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = new vm.SourceTextModule(code, { context });
  modules.set(name, module);
  await module.link((specifier) => {
    if (specifier === "./products") return load("products");
    throw new Error("Unexpected dependency: " + specifier);
  });
  await module.evaluate();
  return module;
}
const { snapshotOrderItems, orderTotal, orderMessage } = (await load("orders"))
  .namespace;
const product = {
  id: "bag",
  name: "Bag",
  colors: ["Red", "Blue"],
  archived: false,
  price: 100.15,
  image: "/default.png",
  colorImages: { Red: "/red.png", Blue: "/blue.png" },
  colorPhotos: { Blue: ["/blue-first.png", "/blue-second.png"] },
};
const selection = { productId: "bag", color: "Blue", quantity: 3 };

test("uses catalog prices and selected color photos, ignoring client totals", () => {
  const items = snapshotOrderItems(
    [{ ...selection, price: 1, subtotal: 1 }],
    [product],
  );
  assert.equal(items[0].image, "/blue-first.png");
  assert.equal(items[0].price, 100.15);
  assert.equal(items[0].subtotal, 300.45);
  assert.equal(orderTotal(items), 300.45);
  assert.equal(items[0].color, "Blue");
  assert.equal(items[0].quantity, 3);
});

test("saved item snapshot survives later catalog changes", () => {
  const current = { ...product };
  const items = snapshotOrderItems([selection], [current]);
  current.name = "Renamed";
  current.price = 999;
  current.colorPhotos.Blue = ["/replacement.png"];
  assert.equal(items[0].name, "Bag");
  assert.equal(items[0].price, 100.15);
  assert.equal(items[0].image, "/blue-first.png");
  current.colorPhotos.Blue = ["/blue-first.png", "/blue-second.png"];
});

test("rejects invalid quantities, colors, unavailable products and duplicates", () => {
  for (const quantity of [0, -1, 100, 1.5, "2", null]) {
    assert.throws(() =>
      snapshotOrderItems([{ ...selection, quantity }], [product]),
    );
  }
  for (const value of [null, [], new Array(101).fill(selection)]) {
    assert.throws(() => snapshotOrderItems(value, [product]));
  }
  assert.throws(() =>
    snapshotOrderItems([{ ...selection, color: "Missing" }], [product]),
  );
  assert.throws(() =>
    snapshotOrderItems([selection], [{ ...product, archived: true }]),
  );
  assert.throws(() => snapshotOrderItems([selection], []));
  assert.throws(() => snapshotOrderItems([selection, selection], [product]));
});

test("supports products without colors and separate variants of the same product", () => {
  const items = snapshotOrderItems(
    [selection, { ...selection, color: "Red", quantity: 1 }],
    [product],
  );
  assert.equal(orderTotal(items), 400.6);
  const plain = snapshotOrderItems(
    [{ ...selection, color: "" }],
    [{ ...product, colors: [] }],
  );
  assert.equal(plain[0].image, "/default.png");
});

test("WhatsApp message contains item details, total and the saved page URL", () => {
  const items = snapshotOrderItems([selection], [product]);
  const url = "https://example.com/orders/test";
  const message = orderMessage({ items, total: orderTotal(items) }, url);
  assert.ok(message.includes("Bag · Blue · 3"));
  assert.ok(message.includes("300,45"));
  assert.ok(message.endsWith(url));
});
