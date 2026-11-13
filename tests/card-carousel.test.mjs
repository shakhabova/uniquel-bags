import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Evaluate the actual helper without loading the application or browser globals.
const sourceUrl = new URL('../lib/card-carousel.ts', import.meta.url);
const source = await fs.readFile(sourceUrl, 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = new vm.SourceTextModule(code, {
  context: vm.createContext({}),
  identifier: sourceUrl.href,
});
await module.link((specifier) => {
  throw new Error(`Unexpected card-carousel dependency: ${specifier}`);
});
await module.evaluate();
const { getHoverPhotoIndex } = module.namespace;

test('clamps positions at and beyond both horizontal edges', () => {
  for (const [clientX, expected] of [
    [-1000, 0], [49.99, 0], [50, 0],
    [249.99, 3], [250, 3], [250.01, 3], [1000, 3],
  ]) {
    assert.equal(getHoverPhotoIndex(clientX, 50, 200, 4), expected, `clientX=${clientX}`);
  }
});

for (const [count, left, width, boundaries] of [
  [2, 10, 20, [20]],
  [3, 50, 120, [90, 130]],
  [4, -10, 100, [15, 40, 65]],
  [5, 0, 2.5, [0.5, 1, 1.5, 2]],
]) {
  test(`divides the card into ${count} equal hover regions`, () => {
    for (const [index, boundary] of boundaries.entries()) {
      const epsilon = width / 10000;
      assert.equal(getHoverPhotoIndex(boundary - epsilon, left, width, count), index,
        `just before boundary ${boundary}`);
      assert.equal(getHoverPhotoIndex(boundary, left, width, count), index + 1,
        `at boundary ${boundary}`);
      assert.equal(getHoverPhotoIndex(boundary + epsilon, left, width, count), index + 1,
        `just after boundary ${boundary}`);
    }
  });
}

test('selects each region across different widths and offsets', () => {
  for (const [left, width] of [[0, 1], [100, 24], [-100, 333], [12.5, 1024], [0, 0.125]]) {
    for (const count of [2, 3, 5, 8]) {
      for (let index = 0; index < count; index++) {
        const clientX = left + width * (index + 0.5) / count;
        assert.equal(getHoverPhotoIndex(clientX, left, width, count), index,
          `left=${left}, width=${width}, count=${count}, index=${index}`);
      }
    }
  }
});

test('returns the first index for a zero-width card', () => {
  for (const clientX of [-100, 50, 1000]) {
    for (const count of [2, 3, 8]) {
      assert.equal(getHoverPhotoIndex(clientX, 50, 0, count), 0,
        `clientX=${clientX}, count=${count}`);
    }
  }
});

test('returns the first index when there are zero or one photos', () => {
  for (const count of [0, 1]) {
    for (const width of [0, 1, 200]) {
      for (const clientX of [-100, 50, 150, 300]) {
        assert.equal(getHoverPhotoIndex(clientX, 50, width, count), 0,
          `clientX=${clientX}, width=${width}, count=${count}`);
      }
    }
  }
});
