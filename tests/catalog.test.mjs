import { test, after } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
// Isolated filesystem, SQLite database and signed cookie; never touches production data.
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "uniquel-bags-test-"));
const env = process.env;
env.DATA_DIR = dataDir;
env.ADMIN_EMAIL = "admin@example.com";
env.ADMIN_PASSWORD = "test-password";
env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
env.NODE_ENV = "test";
let sessionCookie = "";
const context = vm.createContext({
  console,
  Response,
  Request,
  Headers,
  URL,
  File,
  FormData,
  Uint8Array,
  TextDecoder,
  TextEncoder,
  Buffer,
  crypto,
  process,
});
const cache = new Map();
const headersModule = new vm.SyntheticModule(
  ["cookies"],
  function () {
    this.setExport("cookies", async () => ({
      get(name) {
        return name === "uniquel_admin" && sessionCookie
          ? { name, value: sessionCookie }
          : undefined;
      },
    }));
  },
  { context },
);
async function builtin(spec) {
  const imported = await import(spec);
  const names = Object.keys(imported);
  return new vm.SyntheticModule(
    names,
    function () {
      for (const name of names) this.setExport(name, imported[name]);
    },
    { context, identifier: spec },
  );
}
async function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename);
  const source = await fs.readFile(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = new vm.SourceTextModule(code, { context, identifier: filename });
  cache.set(filename, mod);
  await mod.link(async (spec, ref) => {
    if (spec.startsWith("node:")) return builtin(spec);
    if (spec === "next/headers") return headersModule;
    const base = spec.startsWith("@/")
      ? path.resolve(spec.slice(2))
      : path.resolve(path.dirname(ref.identifier), spec);
    for (const candidate of [
      base + ".ts",
      base + ".tsx",
      path.join(base, "index.ts"),
    ]) {
      try {
        await fs.access(candidate);
        return load(candidate);
      } catch {}
    }
    throw new Error(`Cannot resolve ${spec} from ${ref.identifier}`);
  });
  return mod;
}
const paths = [
  "db/index.ts",
  "lib/products.ts",
  "lib/auth.ts",
  "app/api/auth/login/route.ts",
  "app/api/auth/logout/route.ts",
  "app/api/products/route.ts",
  "app/api/products/[id]/route.ts",
  "app/api/upload/route.ts",
  "app/api/images/[key]/route.ts",
  "lib/product-photos.ts",
];
const mods = [];
for (const p of paths) {
  const m = await load(p);
  await m.evaluate();
  mods.push(m.namespace);
}
const [db, model, auth, login, logout, products, item, upload, images, photos] =
  mods;
const base = {
  name: "Test bag",
  category: "Сумки",
  material: "Экокожа",
  colors: ["Чёрный"],
  price: 0.29,
  oldPrice: null,
  description: "Test description",
  image: "https://example.com/bag.jpg",
  stock: "В наличии",
  badge: "",
  demo: false,
};
const request = (method, body, origin = "https://test.example") =>
  new Request("https://test.example/api/products", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
void test("logs in with configured credentials, creates a signed session and logs out", async () => {
  sessionCookie = "";
  const denied = await login.POST(
    request("POST", { email: env.ADMIN_EMAIL, password: "wrong-password" }),
  );
  assert.equal(denied.status, 401);
  const response = await login.POST(
    request("POST", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie?.includes("HttpOnly"));
  assert.ok(cookie?.includes("SameSite=Strict"));
  sessionCookie = cookie.split(";")[0].slice("uniquel_admin=".length);
  assert.equal((await products.POST(request("POST", base))).status, 201);
  const signedOut = await logout.POST(request("POST", {}));
  assert.equal(signedOut.status, 200);
  assert.ok(signedOut.headers.get("set-cookie")?.includes("Max-Age=0"));
  sessionCookie = "";
});
void test("product lists put newest additions first and preserve order after edits or archive changes", async () => {
  sessionCookie = auth.createAdminSession();
  const ids = [];
  for (const name of ["First addition", "Second addition", "Latest addition"]) {
    const response = await products.POST(request("POST", { ...base, name }));
    assert.equal(response.status, 201);
    ids.push((await response.json()).id);
  }
  const listed = async (all = false) =>
    (
      await (
        await products.GET(
          new Request(
            "https://test.example/api/products" + (all ? "?all=1" : ""),
          ),
        )
      ).json()
    )
      .filter((p) => ids.includes(p.id))
      .map((p) => p.id);
  assert.deepEqual(await listed(), [ids[2], ids[1], ids[0]]);
  assert.deepEqual(await listed(true), [ids[2], ids[1], ids[0]]);
  const ctx = { params: Promise.resolve({ id: ids[0] }) };
  assert.equal(
    (
      await item.PUT(
        request("PUT", { ...base, name: "Edited first addition" }),
        ctx,
      )
    ).status,
    200,
  );
  assert.deepEqual(await listed(), [ids[2], ids[1], ids[0]]);
  assert.equal(
    (
      await item.PATCH(request("PATCH", { archived: true }), {
        params: Promise.resolve({ id: ids[2] }),
      })
    ).status,
    200,
  );
  assert.deepEqual(await listed(), [ids[1], ids[0]]);
  assert.deepEqual(await listed(true), [ids[2], ids[1], ids[0]]);
  assert.equal(
    (
      await item.PATCH(request("PATCH", { archived: false }), {
        params: Promise.resolve({ id: ids[2] }),
      })
    ).status,
    200,
  );
  assert.deepEqual(await listed(), [ids[2], ids[1], ids[0]]);
});
void test("two file uploads retain the first cover regardless of selected color order", async () => {
  sessionCookie = auth.createAdminSession();
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR0sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  async function uploadPhoto(name) {
    const form = new FormData();
    form.append("file", new File([png], name, { type: "image/png" }));
    const result = await upload.POST(
      new Request("https://test.example/api/upload", {
        method: "POST",
        headers: { Origin: "https://test.example" },
        body: form,
      }),
    );
    assert.equal(result.status, 200);
    return (await result.json()).image;
  }
  const first = await uploadPhoto("bordo.png"),
    second = await uploadPhoto("black.png");
  assert.notEqual(first, second);
  let draft = {
    ...base,
    colors: ["Чёрный", "Бордовый"],
    colorImages: {},
    image: "",
  };
  draft = photos.setProductPhoto(draft, first, "Бордовый");
  draft = photos.setProductPhoto(draft, second, "Чёрный");
  assert.equal(draft.image, first);
  assert.equal(model.primaryColor(draft), "Бордовый");
  assert.equal(model.productImage(draft, "Чёрный"), second);
  assert.equal(model.productImage(draft, "Бордовый"), first);
  const response = await products.POST(request("POST", draft));
  assert.equal(response.status, 201);
  const created = await response.json();
  const records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  const saved = records.find((p) => p.id === created.id);
  assert.equal(saved.image, first);
  assert.equal(model.primaryColor(saved), "Бордовый");
  const replacement = await uploadPhoto("bordo-new.png");
  const updated = photos.setProductPhoto(saved, replacement, "Бордовый");
  assert.equal(updated.image, first);
  assert.equal(model.productImage(updated, "Чёрный"), second);
});
void test("main photo followed by a second color preserves the first color photo", async () => {
  const black = "https://example.com/black.jpg",
    bordo = "https://example.com/bordo.jpg";
  let draft = { ...base, colors: [], image: "", colorImages: {} };
  draft = photos.setProductPhoto(draft, black);
  draft = photos.toggleProductColor(draft, "Чёрный");
  draft = photos.toggleProductColor(draft, "Бордовый");
  draft = photos.setProductPhoto(draft, bordo, "Бордовый");
  assert.equal(draft.image, black);
  assert.equal(model.productImage(draft, "Чёрный"), black);
  assert.equal(model.productImage(draft, "Бордовый"), bordo);
  draft = photos.setProductPhoto(draft, bordo);
  assert.equal(draft.image, black);
  assert.equal(model.productImage(draft, "Чёрный"), black);
  sessionCookie = auth.createAdminSession();
  const response = await products.POST(request("POST", draft));
  assert.equal(response.status, 201);
  const created = await response.json();
  const records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  const saved = records.find((p) => p.id === created.id);
  assert.equal(model.productImage(saved, "Чёрный"), black);
  assert.equal(model.productImage(saved, "Бордовый"), bordo);
});
void test("color-first uploads select an automatic main photo and preserve legacy color photos", () => {
  let draft = photos.toggleProductColor(
    { ...base, colors: [], image: "", colorImages: {} },
    "Чёрный",
  );
  draft = photos.setProductPhoto(
    draft,
    "https://example.com/black.jpg",
    "Чёрный",
  );
  assert.equal(draft.image, "https://example.com/black.jpg");
  draft = photos.toggleProductColor(draft, "Бордовый");
  draft = photos.setProductPhoto(
    draft,
    "https://example.com/bordo.jpg",
    "Бордовый",
  );
  draft = photos.setProductPhoto(
    draft,
    "https://example.com/black-new.jpg",
    "Чёрный",
  );
  assert.equal(draft.image, "https://example.com/black.jpg");
  assert.equal(
    model.productImage(draft, "Бордовый"),
    "https://example.com/bordo.jpg",
  );
  const legacy = photos.setProductPhoto(
    { ...base, colors: ["Чёрный", "Бордовый"] },
    "https://example.com/new-main.jpg",
  );
  assert.equal(model.productImage(legacy, "Чёрный"), base.image);
  assert.equal(model.productImage(legacy, "Бордовый"), base.image);
  assert.equal(legacy.image, base.image);
  draft = photos.toggleProductColor(draft, "Бордовый");
  assert.equal(draft.colorImages["Бордовый"], undefined);
  assert.equal(
    photos.setProductPhoto(draft, "https://example.com/bordo.jpg", "Бордовый"),
    draft,
  );
});
void test("cropping existing color photos updates the cover only when editing its photo", () => {
  const black = "https://example.com/black.jpg",
    bordo = "https://example.com/bordo.jpg",
    crop = "/api/images/cafe-1234.jpg";
  const original = {
    ...base,
    image: black,
    colors: ["Чёрный", "Бордовый"],
    colorImages: { Чёрный: black, Бордовый: bordo },
  };
  const cover = photos.editProductPhoto(original, crop, "Чёрный");
  assert.equal(cover.image, crop);
  assert.equal(cover.colorImages["Чёрный"], crop);
  assert.equal(cover.colorImages["Бордовый"], bordo);
  const variant = photos.editProductPhoto(original, crop, "Бордовый");
  assert.equal(variant.image, black);
  assert.equal(variant.colorImages["Чёрный"], black);
  assert.equal(variant.colorImages["Бордовый"], crop);
  const main = photos.editProductPhoto(original, crop);
  assert.equal(main.image, crop);
  assert.equal(main.colorImages["Чёрный"], crop);
  assert.equal(main.colorImages["Бордовый"], bordo);
  assert.equal(photos.editProductPhoto(original, crop, "Серый"), original);
  assert.equal(
    photos.editProductPhoto({ ...base, colors: [] }, crop).image,
    crop,
  );
  assert.equal(original.image, black);
  assert.equal(original.colorImages["Чёрный"], black);
});
void test("validates color photos and falls back to the main photo for legacy products", () => {
  const bag = {
    ...base,
    colors: ["Чёрный", "Бежевый"],
    colorImages: {
      Чёрный: " https://example.com/black.jpg ",
      Бежевый: "/api/images/abcd-1234.png",
    },
  };
  const validated = model.validateProduct(bag);
  assert.equal(
    model.productImage(validated, "Чёрный"),
    "https://example.com/black.jpg",
  );
  assert.equal(
    model.productImage(validated, "Бежевый"),
    "/api/images/abcd-1234.png",
  );
  assert.equal(model.productImage(base, "Чёрный"), base.image);
  assert.equal(model.productImage({ ...base, colors: [] }, ""), base.image);
  assert.equal(model.productImage(validated, "Серый"), base.image);
  assert.equal(
    model.productImage(
      model.validateProduct({ ...bag, colorImages: { Чёрный: "" } }),
      "Чёрный",
    ),
    base.image,
  );
  for (const colorImages of [
    null,
    [],
    { Серый: "https://example.com/grey.jpg" },
    { Чёрный: 12 },
    { Чёрный: "javascript:alert(1)" },
    { Чёрный: "http://example.com/black.jpg" },
    { Чёрный: "/api/images/../bad.png" },
    { Чёрный: "https://example.com/" + "x".repeat(2000) },
  ])
    assert.throws(() => model.validateProduct({ ...bag, colorImages }));
});
void test("persists multiple color photos in one product and removes a color on edit", async () => {
  sessionCookie = auth.createAdminSession();
  const variants = {
    ...base,
    colors: ["Чёрный", "Бежевый"],
    colorImages: {
      Чёрный: "https://example.com/black.jpg",
      Бежевый: "https://example.com/beige.jpg",
    },
  };
  const response = await products.POST(request("POST", variants));
  assert.equal(response.status, 201);
  const created = await response.json();
  let records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.equal(records.filter((p) => p.id === created.id).length, 1);
  assert.deepEqual(
    records.find((p) => p.id === created.id).colorImages,
    variants.colorImages,
  );
  const ctx = { params: Promise.resolve({ id: created.id }) };
  const updated = await item.PUT(
    request("PUT", {
      ...variants,
      colors: ["Бежевый"],
      colorImages: { Бежевый: "https://example.com/new-beige.jpg" },
    }),
    ctx,
  );
  assert.equal(updated.status, 200);
  records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  const saved = records.find((p) => p.id === created.id);
  assert.deepEqual(saved.colors, ["Бежевый"]);
  assert.deepEqual(saved.colorImages, {
    Бежевый: "https://example.com/new-beige.jpg",
  });
  assert.equal(
    model.productImage(saved, "Бежевый"),
    "https://example.com/new-beige.jpg",
  );
  const cleared = await item.PUT(
    request("PUT", { ...base, colors: [], colorImages: {} }),
    ctx,
  );
  assert.equal(cleared.status, 200);
  records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.deepEqual(records.find((p) => p.id === created.id).colorImages, {});
});
after(async () => {
  db.getDb().close();
  await fs.rm(dataDir, { recursive: true, force: true });
});
void test("saves and reloads multiple photos per color through the product API", async () => {
  sessionCookie = auth.createAdminSession();
  const colorPhotos = {
    Чёрный: ["https://example.com/front.jpg", "https://example.com/back.jpg"],
    Бежевый: ["https://example.com/beige.jpg"],
  };
  const body = {
    ...base,
    colors: ["Чёрный", "Бежевый"],
    image: colorPhotos["Чёрный"][0],
    colorPhotos,
  };
  const createdResponse = await products.POST(request("POST", body));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.deepEqual(created.colorPhotos, colorPhotos);
  const records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.deepEqual(
    records.find((p) => p.id === created.id).colorPhotos,
    colorPhotos,
  );
  const updatedPhotos = {
    Чёрный: [colorPhotos["Чёрный"][1]],
    Бежевый: colorPhotos["Бежевый"],
  };
  const response = await item.PUT(
    request("PUT", {
      ...body,
      image: colorPhotos["Чёрный"][1],
      colorPhotos: updatedPhotos,
    }),
    { params: Promise.resolve({ id: created.id }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).colorPhotos, updatedPhotos);
  const saved = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.deepEqual(
    saved.find((p) => p.id === created.id).colorPhotos,
    updatedPhotos,
  );
});
test("validates prices, categories, colors and photo URLs", () => {
  assert.equal(model.validateProduct(base).price, 0.29);
  for (const changes of [
    { price: -1 },
    { price: NaN },
    { price: 1.111 },
    { category: "invalid" },
    { colors: null },
    { colors: "Чёрный" },
    { colors: ["invalid"] },
    { image: "javascript:alert(1)" },
    { image: "http://example.com/a.jpg" },
    { oldPrice: 0.1 },
  ])
    assert.throws(() => model.validateProduct({ ...base, ...changes }));
  assert.equal(
    model.validateProduct({ ...base, image: "/api/images/abcd-1234.png" })
      .image,
    "/api/images/abcd-1234.png",
  );
});
test("rejects anonymous, unrelated accounts and cross-origin writes", async () => {
  sessionCookie = "";
  assert.equal((await products.POST(request("POST", base))).status, 403);
  sessionCookie = "invalid-session";
  assert.equal((await products.POST(request("POST", base))).status, 403);
  sessionCookie = auth.createAdminSession();
  assert.equal(
    (await products.POST(request("POST", base, "https://evil.example"))).status,
    403,
  );
  const allowed = env.ADMIN_EMAIL;
  env.ADMIN_EMAIL = "";
  assert.equal((await products.POST(request("POST", base))).status, 403);
  env.ADMIN_EMAIL = allowed;
  sessionCookie = "";
  assert.equal(
    (await products.GET(new Request("https://test.example/api/products?all=1")))
      .status,
    403,
  );
});
test("creates, reads, updates, archives and restores durable products", async () => {
  sessionCookie = auth.createAdminSession();
  const response = await products.POST(request("POST", base));
  assert.equal(response.status, 201);
  const created = await response.json();
  let records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.ok(records.some((p) => p.id === created.id));
  const ctx = { params: Promise.resolve({ id: created.id }) };
  assert.equal(
    (
      await item.PUT(
        request("PUT", { ...base, name: "Updated bag", price: 4900 }),
        ctx,
      )
    ).status,
    200,
  );
  records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.equal(records.find((p) => p.id === created.id).price, 4900);
  assert.equal(
    (await item.PATCH(request("PATCH", { archived: true }), ctx)).status,
    200,
  );
  records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.ok(!records.some((p) => p.id === created.id));
  records = await (
    await products.GET(new Request("https://test.example/api/products?all=1"))
  ).json();
  assert.equal(records.find((p) => p.id === created.id).archived, true);
  assert.equal(
    (await item.PATCH(request("PATCH", { archived: false }), ctx)).status,
    200,
  );
  records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.ok(records.some((p) => p.id === created.id));
  assert.equal(
    (await item.PUT(request("PUT", { ...base, price: -2 }), ctx)).status,
    400,
  );
  assert.equal(
    (await item.PATCH(request("PATCH", { archived: "true" }), ctx)).status,
    400,
  );
  assert.equal(
    (
      await item.PUT(request("PUT", base), {
        params: Promise.resolve({ id: "missing" }),
      })
    ).status,
    404,
  );
});
test("validates uploads and retrieves stored image bytes", async () => {
  sessionCookie = auth.createAdminSession();
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR0sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const form = new FormData();
  form.append("file", new File([png], "photo.png", { type: "image/png" }));
  const res = await upload.POST(
    new Request("https://test.example/api/upload", {
      method: "POST",
      headers: { Origin: "https://test.example" },
      body: form,
    }),
  );
  assert.equal(res.status, 200);
  const result = await res.json();
  const key = result.image.split("/").at(-1);
  const photo = await images.GET(
    new Request("https://test.example" + result.image),
    { params: Promise.resolve({ key }) },
  );
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), png);
  const bad = new FormData();
  bad.append("file", new File(["<svg/>"], "x.png", { type: "image/png" }));
  assert.equal(
    (
      await upload.POST(
        new Request("https://test.example/api/upload", {
          method: "POST",
          headers: { Origin: "https://test.example" },
          body: bad,
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await images.GET(new Request("https://test.example/api/images/x"), {
        params: Promise.resolve({ key: "../bad" }),
      })
    ).status,
    404,
  );
  sessionCookie = "";
  assert.equal(
    (
      await upload.POST(
        new Request("https://test.example/api/upload", {
          method: "POST",
          headers: { Origin: "https://test.example" },
          body: form,
        }),
      )
    ).status,
    403,
  );
});

test("saves and updates products with new colors or no color", async () => {
  sessionCookie = auth.createAdminSession();
  for (const selectedColors of [
    [],
    ["Серый"],
    ["Голубой"],
    ["Серый", "Голубой"],
  ]) {
    const response = await products.POST(
      request("POST", { ...base, colors: selectedColors }),
    );
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.deepEqual(created.colors, selectedColors);
    const records = await (
      await products.GET(new Request("https://test.example/api/products"))
    ).json();
    assert.deepEqual(
      records.find((p) => p.id === created.id).colors,
      selectedColors,
    );
    const ctx = { params: Promise.resolve({ id: created.id }) };
    const updated = await item.PUT(
      request("PUT", { ...base, colors: [] }),
      ctx,
    );
    assert.equal(updated.status, 200);
    assert.deepEqual((await updated.json()).colors, []);
    const afterUpdate = await (
      await products.GET(new Request("https://test.example/api/products"))
    ).json();
    assert.deepEqual(afterUpdate.find((p) => p.id === created.id).colors, []);
  }
});

test("allows optional description and size while enforcing length limits", () => {
  for (const description of ["", undefined, "   "]) {
    const product = model.validateProduct({ ...base, description });
    assert.equal(product.description, "");
    assert.equal(product.size, "");
  }
  assert.equal(
    model.validateProduct({ ...base, size: " 30 × 20 × 12 см " }).size,
    "30 × 20 × 12 см",
  );
  assert.throws(() =>
    model.validateProduct({ ...base, size: "x".repeat(101) }),
  );
  assert.throws(() =>
    model.validateProduct({ ...base, description: "x".repeat(5001) }),
  );
});
test("persists bag size with an empty description and can clear the size", async () => {
  sessionCookie = auth.createAdminSession();
  const response = await products.POST(
    request("POST", { ...base, description: "", size: "30 × 20 × 12 см" }),
  );
  assert.equal(response.status, 201);
  const created = await response.json();
  const records = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  const saved = records.find((p) => p.id === created.id);
  assert.equal(saved.size, "30 × 20 × 12 см");
  assert.equal(saved.description, "");
  assert.ok(
    records.filter((p) => p.id.startsWith("demo-")).every((p) => p.size === ""),
  );
  const ctx = { params: Promise.resolve({ id: created.id }) };
  const updated = await item.PUT(
    request("PUT", { ...base, description: "", size: "25 × 15 см" }),
    ctx,
  );
  assert.equal(updated.status, 200);
  const afterUpdate = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.equal(afterUpdate.find((p) => p.id === created.id).size, "25 × 15 см");
  const cleared = await item.PUT(
    request("PUT", { ...base, description: "", size: "" }),
    ctx,
  );
  assert.equal(cleared.status, 200);
  const afterClear = await (
    await products.GET(new Request("https://test.example/api/products"))
  ).json();
  assert.equal(afterClear.find((p) => p.id === created.id).size, "");
});
