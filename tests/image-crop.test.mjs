import { test } from "node:test";
import assert from "node:assert/strict";
import { Blob, File } from "node:buffer";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Evaluate the real TypeScript in an isolated realm; no browser globals or files
// outside this test's sandbox are changed.
const sourceUrl = new URL("../lib/image-crop.ts", import.meta.url);
const source = await fs.readFile(sourceUrl, "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

async function loadImageCrop(globals = {}) {
  const context = vm.createContext({ File, ...globals });
  const module = new vm.SourceTextModule(code, {
    context,
    identifier: sourceUrl.href,
  });
  await module.link((specifier) => {
    throw new Error(`Unexpected image-crop dependency: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace;
}

const { clampPosition, getImageCrop, getCropOutputSize } =
  await loadImageCrop();
const center = { x: 50, y: 50 };
const landscape = { width: 4000, height: 3000 };
const portrait = { width: 2400, height: 4000 };
// Spread returned objects before deep comparisons to normalize VM prototypes.
const centeredCases = [
  [
    "portrait crop of landscape",
    landscape,
    3 / 4,
    { width: 2250, height: 3000, x: 875, y: 0 },
    { width: 1125, height: 1500, x: 1437.5, y: 750 },
  ],
  [
    "square crop of landscape",
    landscape,
    1,
    { width: 3000, height: 3000, x: 500, y: 0 },
    { width: 1500, height: 1500, x: 1250, y: 750 },
  ],
  [
    "original crop of landscape",
    landscape,
    4 / 3,
    { width: 4000, height: 3000, x: 0, y: 0 },
    { width: 2000, height: 1500, x: 1000, y: 750 },
  ],
  [
    "portrait crop of portrait",
    portrait,
    3 / 4,
    { width: 2400, height: 3200, x: 0, y: 400 },
    { width: 1200, height: 1600, x: 600, y: 1200 },
  ],
  [
    "square crop of portrait",
    portrait,
    1,
    { width: 2400, height: 2400, x: 0, y: 800 },
    { width: 1200, height: 1200, x: 600, y: 1400 },
  ],
  [
    "original crop of portrait",
    portrait,
    3 / 5,
    { width: 2400, height: 4000, x: 0, y: 0 },
    { width: 1200, height: 2000, x: 600, y: 1000 },
  ],
];

for (const [name, image, aspect, expected, zoomed] of centeredCases) {
  test(`centers ${name}`, () => {
    assert.deepEqual({ ...getImageCrop(image, aspect, 1, center) }, expected);
  });
  test(`zoom 2 halves the dimensions and recenters ${name}`, () => {
    assert.deepEqual({ ...getImageCrop(image, aspect, 2, center) }, zoomed);
  });
}

test("supports fractional zoom and percentage positioning without mutating inputs", () => {
  const image = Object.freeze({ width: 8000, height: 6000 });
  const position = Object.freeze({ x: 25, y: 75 });
  assert.deepEqual(
    { ...getImageCrop(image, 3 / 4, 1.5, position) },
    {
      width: 3000,
      height: 4000,
      x: 1250,
      y: 1500,
    },
  );
});

test("clampPosition preserves percentages and clamps both bounds", () => {
  for (const [input, expected] of [
    [-Infinity, 0],
    [-100, 0],
    [-0.5, 0],
    [0, 0],
    [12.5, 12.5],
    [50, 50],
    [100, 100],
    [100.5, 100],
    [200, 100],
    [Infinity, 100],
  ]) {
    assert.equal(clampPosition(input), expected, `position ${input}`);
  }
});

for (const [name, position, outside, x, y] of [
  ["top-left", { x: 0, y: 0 }, { x: -30, y: -40 }, 0, 0],
  ["top-right", { x: 100, y: 0 }, { x: 130, y: -40 }, 2500, 0],
  ["bottom-left", { x: 0, y: 100 }, { x: -30, y: 140 }, 0, 1500],
  ["bottom-right", { x: 100, y: 100 }, { x: 130, y: 140 }, 2500, 1500],
]) {
  test(`positions and clamps the crop at the ${name} corner`, () => {
    const expected = { width: 1500, height: 1500, x, y };
    assert.deepEqual({ ...getImageCrop(landscape, 1, 2, position) }, expected);
    assert.deepEqual({ ...getImageCrop(landscape, 1, 2, outside) }, expected);
  });
}

test("all crop edges stay within the image across aspects, zooms and positions", () => {
  for (const image of [landscape, portrait, { width: 1000, height: 1000 }]) {
    for (const aspect of [3 / 4, 1, image.width / image.height, 16 / 9]) {
      for (const zoom of [1, 1.5, 2, 8]) {
        for (const x of [-100, 0, 25, 50, 100, 200]) {
          for (const y of [-100, 0, 75, 100, 200]) {
            const crop = getImageCrop(image, aspect, zoom, { x, y });
            assert.ok(crop.width > 0 && crop.height > 0);
            assert.ok(crop.x >= 0 && crop.y >= 0);
            assert.ok(crop.x + crop.width <= image.width + 1e-9);
            assert.ok(crop.y + crop.height <= image.height + 1e-9);
            assert.ok(Math.abs(crop.width / crop.height - aspect) < 1e-9);
          }
        }
      }
    }
  }
});

for (const dimension of ["width", "height"]) {
  test(`rejects invalid image ${dimension}`, () => {
    for (const value of [
      0,
      -1,
      NaN,
      Infinity,
      -Infinity,
      undefined,
      null,
      "100",
    ]) {
      assert.throws(
        () => getImageCrop({ ...landscape, [dimension]: value }, 1, 1, center),
        /Некорректные параметры кадрирования/,
        `${dimension}=${String(value)}`,
      );
    }
  });
}

test("rejects non-positive or non-finite aspects", () => {
  for (const aspect of [
    0,
    -1,
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    "1",
  ]) {
    assert.throws(
      () => getImageCrop(landscape, aspect, 1, center),
      /Некорректные параметры кадрирования/,
    );
  }
});

test("rejects zoom below one and non-finite zoom", () => {
  for (const zoom of [
    0,
    0.99,
    -1,
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    "2",
  ]) {
    assert.throws(
      () => getImageCrop(landscape, 1, zoom, center),
      /Некорректные параметры кадрирования/,
    );
  }
});

for (const axis of ["x", "y"]) {
  test(`rejects non-finite ${axis} positions instead of silently clamping them`, () => {
    for (const value of [NaN, Infinity, -Infinity, undefined, null, "50"]) {
      assert.throws(
        () => getImageCrop(landscape, 1, 1, { ...center, [axis]: value }),
        /Некорректные параметры кадрирования/,
      );
    }
  });
}

for (const [name, crop, expected] of [
  [
    "small landscape without upscaling",
    { width: 800, height: 600 },
    { width: 800, height: 600 },
  ],
  [
    "small portrait without upscaling",
    { width: 600, height: 800 },
    { width: 600, height: 800 },
  ],
  [
    "one pixel without upscaling",
    { width: 1, height: 1 },
    { width: 1, height: 1 },
  ],
  [
    "exactly the limit",
    { width: 2000, height: 2000 },
    { width: 2000, height: 2000 },
  ],
  [
    "large landscape",
    { width: 4000, height: 3000 },
    { width: 2000, height: 1500 },
  ],
  [
    "large portrait",
    { width: 3000, height: 4000 },
    { width: 1500, height: 2000 },
  ],
  [
    "large square",
    { width: 6000, height: 6000 },
    { width: 2000, height: 2000 },
  ],
  [
    "rounded proportional dimensions",
    { width: 6000, height: 4001 },
    { width: 2000, height: 1334 },
  ],
  [
    "a minimum one-pixel short side",
    { width: 10000000, height: 1 },
    { width: 2000, height: 1 },
  ],
  [
    "fractional crop dimensions",
    { width: 400.4, height: 300.6 },
    { width: 400, height: 301 },
  ],
  [
    "subpixel dimensions",
    { width: 0.25, height: 0.5 },
    { width: 1, height: 1 },
  ],
]) {
  test(`output size: ${name}`, () => {
    const size = getCropOutputSize(crop);
    assert.deepEqual({ ...size }, expected);
    assert.ok(Number.isInteger(size.width) && Number.isInteger(size.height));
    assert.ok(size.width >= 1 && size.height >= 1);
    assert.ok(size.width <= 2000 && size.height <= 2000);
  });
}

test("output size honors a custom maximum without upscaling", () => {
  assert.deepEqual(
    { ...getCropOutputSize(landscape, 800) },
    { width: 800, height: 600 },
  );
  assert.deepEqual(
    { ...getCropOutputSize(portrait, 800) },
    { width: 480, height: 800 },
  );
  assert.deepEqual({ ...getCropOutputSize(landscape, 10000) }, landscape);
});

async function createExportHarness(options = {}) {
  const calls = [];
  const blob = options.emptyBlob
    ? null
    : new Blob(["encoded JPEG bytes"], { type: "image/jpeg" });
  class MockImage {
    naturalWidth = 8000;
    naturalHeight = 6000;
  }
  const image = new MockImage();
  const context = {
    set fillStyle(value) {
      calls.push(["fillStyle", value]);
    },
    set imageSmoothingQuality(value) {
      calls.push(["imageSmoothingQuality", value]);
    },
    fillRect(...args) {
      calls.push(["fillRect", ...args]);
    },
    drawImage(...args) {
      calls.push(["drawImage", ...args]);
      if (options.drawError) throw options.drawError;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext(kind) {
      calls.push(["getContext", kind]);
      return options.noContext ? null : context;
    },
    toBlob(callback, type, quality) {
      calls.push(["toBlob", type, quality]);
      if (options.toBlobError) throw options.toBlobError;
      // Exercise completion after the Promise executor has returned.
      queueMicrotask(() => callback(blob));
    },
  };
  const document = {
    createElement(tag) {
      calls.push(["createElement", tag]);
      assert.equal(tag, "canvas");
      return canvas;
    },
  };
  const { exportImageCrop } = await loadImageCrop({
    document,
    Image: MockImage,
  });
  return { exportImageCrop, image, canvas, calls, blob };
}

for (const [name, crop, size] of [
  [
    "large portrait crop",
    { x: 1250, y: 1500, width: 3000, height: 4000 },
    { width: 1500, height: 2000 },
  ],
  [
    "large landscape crop",
    { x: 200, y: 300, width: 4000, height: 3000 },
    { width: 2000, height: 1500 },
  ],
  [
    "small crop with fractional source coordinates",
    { x: 12.5, y: 25.25, width: 640, height: 480 },
    { width: 640, height: 480 },
  ],
]) {
  test(`exports ${name} as a white-backed JPEG using exact source coordinates`, async () => {
    const { exportImageCrop, image, canvas, calls, blob } =
      await createExportHarness();
    const file = await exportImageCrop(image, Object.freeze(crop));
    assert.equal(canvas.width, size.width);
    assert.equal(canvas.height, size.height);
    assert.deepEqual(calls, [
      ["createElement", "canvas"],
      ["getContext", "2d"],
      ["fillStyle", "#ffffff"],
      ["fillRect", 0, 0, size.width, size.height],
      ["imageSmoothingQuality", "high"],
      [
        "drawImage",
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        size.width,
        size.height,
      ],
      ["toBlob", "image/jpeg", 0.92],
    ]);
    assert.ok(file instanceof File);
    assert.equal(file.name, "product-photo.jpg");
    assert.equal(file.type, "image/jpeg");
    assert.equal(file.size, blob.size);
    assert.deepEqual(await file.arrayBuffer(), await blob.arrayBuffer());
  });
}

const exportCrop = { x: 10, y: 20, width: 600, height: 800 };

test("export rejects a missing 2D context before drawing or encoding", async () => {
  const { exportImageCrop, image, calls } = await createExportHarness({
    noContext: true,
  });
  await assert.rejects(
    exportImageCrop(image, exportCrop),
    /Не удалось обработать фото в этом браузере/,
  );
  assert.deepEqual(calls, [
    ["createElement", "canvas"],
    ["getContext", "2d"],
  ]);
});

test("export rejects when JPEG encoding returns a null blob", async () => {
  const { exportImageCrop, image, calls } = await createExportHarness({
    emptyBlob: true,
  });
  await assert.rejects(
    exportImageCrop(image, exportCrop),
    /Не удалось сохранить фото/,
  );
  assert.deepEqual(calls.at(-1), ["toBlob", "image/jpeg", 0.92]);
});

test("export propagates synchronous canvas encoding failures", async () => {
  const error = new Error("Canvas is tainted");
  const { exportImageCrop, image } = await createExportHarness({
    toBlobError: error,
  });
  await assert.rejects(
    exportImageCrop(image, exportCrop),
    (actual) => actual === error,
  );
});

test("export propagates drawing failures without attempting to encode", async () => {
  const error = new Error("Image could not be drawn");
  const { exportImageCrop, image, calls } = await createExportHarness({
    drawError: error,
  });
  await assert.rejects(
    exportImageCrop(image, exportCrop),
    (actual) => actual === error,
  );
  assert.equal(calls.at(-1)[0], "drawImage");
  assert.ok(!calls.some(([method]) => method === "toBlob"));
});
