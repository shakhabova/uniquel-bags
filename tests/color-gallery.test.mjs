import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Load each real module in isolation: the photo helpers' Product import is type-only.
async function loadModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const source = await fs.readFile(sourceUrl, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = new vm.SourceTextModule(code, {
    context: vm.createContext({ URL }),
    identifier: sourceUrl.href,
  });
  await module.link((specifier) => {
    throw new Error(`Unexpected dependency in ${relativePath}: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace;
}

const model = await loadModule('../lib/products.ts');
const helpers = await loadModule('../lib/product-photos.ts');
const { productGallery, validateProduct, MAX_COLOR_PHOTOS } = model;
const { assignedColorPhotos, addColorPhoto, replaceColorPhoto, removeColorPhoto, toggleProductColor } = helpers;

const black = 'Чёрный';
const beige = 'Бежевый';
const grey = 'Серый';
const photo = (name) => `https://example.com/${name}.jpg`;
const [cover, second, third, beigePhoto, replacement] =
  ['cover', 'second', 'third', 'beige', 'replacement'].map(photo);
const base = {
  name: 'Test bag', category: 'Сумки', material: 'Экокожа',
  colors: [black, beige], image: cover, price: 1000, oldPrice: null,
  description: '', size: '', stock: 'В наличии', badge: '', demo: false,
};

// Normalize cross-realm prototypes, including nested arrays and objects.
const plain = (value) => JSON.parse(JSON.stringify(value));
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function immutable(value, operation) {
  const before = plain(value);
  deepFreeze(value);
  const result = operation(value);
  assert.deepEqual(plain(value), before, 'operation must not mutate its input');
  return result;
}

test('gallery and assigned photos distinguish legacy color, cover fallback and no photo', () => {
  const legacy = deepFreeze({ ...base, colorImages: { [black]: second } });
  assert.deepEqual(plain(productGallery(legacy, black)), [second]);
  assert.deepEqual(plain(assignedColorPhotos(legacy, black)), [second]);
  assert.deepEqual(plain(productGallery(legacy, beige)), [cover]);
  assert.deepEqual(plain(assignedColorPhotos(legacy, beige)), []);
  assert.deepEqual(plain(productGallery(legacy, grey)), [cover]);
  assert.deepEqual(plain(assignedColorPhotos(legacy, grey)), []);
  assert.deepEqual(plain(productGallery(legacy)), [cover]);
  assert.deepEqual(plain(assignedColorPhotos(legacy, '')), []);
  const empty = deepFreeze({ ...legacy, image: '', colorImages: {} });
  assert.deepEqual(plain(productGallery(empty, beige)), []);
  assert.deepEqual(plain(assignedColorPhotos(empty, beige)), []);
});

test('gallery prefers a nonempty selected color gallery and falls back for empty or unselected galleries', () => {
  const input = deepFreeze({ ...base, colorImages: { [black]: third, [beige]: beigePhoto },
    colorPhotos: { [black]: [cover, second], [beige]: [], [grey]: [third] } });
  assert.deepEqual(plain(productGallery(input, black)), [cover, second]);
  assert.deepEqual(plain(assignedColorPhotos(input, black)), [cover, second]);
  assert.deepEqual(plain(productGallery(input, beige)), [beigePhoto]);
  assert.deepEqual(plain(assignedColorPhotos(input, beige)), [beigePhoto]);
  assert.deepEqual(plain(productGallery(input, grey)), [cover]);
  assert.deepEqual(plain(assignedColorPhotos(input, grey)), []);
});

test('append migrates legacy color photos, preserves their order and leaves other colors and cover alone', () => {
  const original = { ...base, colorImages: { [black]: cover, [beige]: beigePhoto } };
  const result = immutable(original, (p) => addColorPhoto(p, second, black));
  assert.notEqual(result, original);
  assert.equal(result.image, cover);
  assert.deepEqual(plain(result.colorPhotos), { [black]: [cover, second] });
  assert.deepEqual(plain(result.colorImages), { [black]: cover, [beige]: beigePhoto });
  assert.deepEqual(plain(assignedColorPhotos(result, beige)), [beigePhoto]);
  const next = immutable(result, (p) => addColorPhoto(p, third, black));
  assert.deepEqual(plain(assignedColorPhotos(next, black)), [cover, second, third]);
  assert.equal(next.image, cover);
});

test('first append establishes a cover only if none exists, without assigning other colors', () => {
  const draft = { ...base, image: '', colorImages: {}, colorPhotos: {} };
  const withBeige = immutable(draft, (p) => addColorPhoto(p, beigePhoto, beige));
  assert.equal(withBeige.image, beigePhoto);
  assert.deepEqual(plain(assignedColorPhotos(withBeige, beige)), [beigePhoto]);
  assert.deepEqual(plain(assignedColorPhotos(withBeige, black)), []);
  const withBlack = immutable(withBeige, (p) => addColorPhoto(p, cover, black));
  assert.equal(withBlack.image, beigePhoto);
  assert.deepEqual(plain(withBlack.colorPhotos), { [beige]: [beigePhoto], [black]: [cover] });
});

test('append ignores missing or unselected colors, empty photos, duplicates and entries beyond the cap', () => {
  assert.equal(MAX_COLOR_PHOTOS, 10);
  const images = Array.from({ length: MAX_COLOR_PHOTOS }, (_, i) => photo(`black-${i}`));
  let draft = deepFreeze({ ...base, image: '', colorImages: {}, colorPhotos: {} });
  for (const image of images) draft = immutable(draft, (p) => addColorPhoto(p, image, black));
  assert.deepEqual(plain(assignedColorPhotos(draft, black)), images);
  assert.equal(draft.image, images[0]);
  for (const [image, color] of [[third, black], [images[0], black], ['', beige], [second, grey], [second, '']]) {
    assert.equal(addColorPhoto(draft, image, color), draft);
  }
  // The cap is per color, not per product.
  const other = immutable(draft, (p) => addColorPhoto(p, beigePhoto, beige));
  assert.deepEqual(plain(assignedColorPhotos(other, beige)), [beigePhoto]);
  assert.deepEqual(plain(assignedColorPhotos(other, black)), images);
});

test('replacement uses the requested index and updates the cover only when that photo was the cover', () => {
  const original = { ...base, image: second,
    colorImages: { [black]: cover, [beige]: beigePhoto },
    colorPhotos: { [black]: [cover, second, third], [beige]: [beigePhoto] } };
  const first = immutable(original, (p) => replaceColorPhoto(p, replacement, black, 0));
  assert.deepEqual(plain(first.colorPhotos[black]), [replacement, second, third]);
  assert.equal(first.colorImages[black], replacement);
  assert.equal(first.image, second);
  assert.deepEqual(plain(first.colorPhotos[beige]), [beigePhoto]);
  const selectedCover = immutable(original, (p) => replaceColorPhoto(p, replacement, black, 1));
  assert.deepEqual(plain(selectedCover.colorPhotos[black]), [cover, replacement, third]);
  assert.equal(selectedCover.colorImages[black], cover);
  assert.equal(selectedCover.image, replacement);
  const last = immutable(original, (p) => replaceColorPhoto(p, replacement, black, 2));
  assert.deepEqual(plain(last.colorPhotos[black]), [cover, second, replacement]);
  assert.equal(last.image, second);
});

test('replacement handles legacy entries and ignores invalid indices, duplicates and unselected colors', () => {
  const original = deepFreeze({ ...base, colorImages: { [black]: cover, [beige]: beigePhoto },
    colorPhotos: { [black]: [cover, second] } });
  for (const [image, color, index] of [[replacement, black, -1], [replacement, black, 2],
    [cover, black, 1], ['', black, 0], [replacement, grey, 0]]) {
    assert.equal(replaceColorPhoto(original, image, color, index), original);
  }
  const legacy = { ...base, colorImages: { [black]: cover, [beige]: beigePhoto } };
  const result = immutable(legacy, (p) => replaceColorPhoto(p, replacement, beige, 0));
  assert.equal(result.image, cover);
  assert.deepEqual(plain(result.colorPhotos), { [beige]: [replacement] });
  assert.equal(result.colorImages[beige], replacement);
  assert.equal(result.colorImages[black], cover);
});

test('removing a non-cover or cover selects the remaining photo and preserves the other color', () => {
  const original = { ...base, colorImages: { [black]: cover, [beige]: beigePhoto },
    colorPhotos: { [black]: [cover, second, third], [beige]: [beigePhoto] } };
  const withoutMiddle = immutable(original, (p) => removeColorPhoto(p, black, 1));
  assert.deepEqual(plain(withoutMiddle.colorPhotos[black]), [cover, third]);
  assert.equal(withoutMiddle.colorImages[black], cover);
  assert.equal(withoutMiddle.image, cover);
  const withoutCover = immutable(original, (p) => removeColorPhoto(p, black, 0));
  assert.deepEqual(plain(withoutCover.colorPhotos[black]), [second, third]);
  assert.equal(withoutCover.colorImages[black], second);
  assert.equal(withoutCover.image, second);
  assert.deepEqual(plain(withoutCover.colorPhotos[beige]), [beigePhoto]);
  assert.equal(withoutCover.colorImages[beige], beigePhoto);
});

test('removing the last cover chooses another assigned color or clears the cover', () => {
  const original = { ...base, colorImages: { [black]: cover, [beige]: beigePhoto },
    colorPhotos: { [black]: [cover], [beige]: [beigePhoto] } };
  const removed = immutable(original, (p) => removeColorPhoto(p, black, 0));
  assert.equal(removed.image, beigePhoto);
  assert.equal(Object.hasOwn(removed.colorImages, black), false);
  assert.equal(Object.hasOwn(removed.colorPhotos, black), false);
  assert.deepEqual(plain(assignedColorPhotos(removed, black)), []);
  assert.deepEqual(plain(assignedColorPhotos(removed, beige)), [beigePhoto]);
  const cleared = immutable(removed, (p) => removeColorPhoto(p, beige, 0));
  assert.equal(cleared.image, '');
  assert.deepEqual(plain(cleared.colorImages), {});
  assert.deepEqual(plain(cleared.colorPhotos), {});
  assert.deepEqual(plain(cleared.colors), [black, beige]);
  for (const [color, index] of [[black, -1], [black, 1], [grey, 0]]) {
    assert.equal(removeColorPhoto(deepFreeze(original), color, index), original);
  }
});

test('toggling colors removes only their assigned photos and does not resurrect them', () => {
  const original = { ...base, colorImages: { [black]: cover, [beige]: beigePhoto },
    colorPhotos: { [black]: [cover, second], [beige]: [beigePhoto] } };
  const removed = immutable(original, (p) => toggleProductColor(p, black));
  assert.deepEqual(plain(removed.colors), [beige]);
  assert.deepEqual(plain(removed.colorImages), { [beige]: beigePhoto });
  assert.deepEqual(plain(removed.colorPhotos), { [beige]: [beigePhoto] });
  assert.equal(removed.image, cover);
  const added = immutable(removed, (p) => toggleProductColor(p, black));
  assert.deepEqual(plain(added.colors), [beige, black]);
  assert.deepEqual(plain(assignedColorPhotos(added, black)), []);
  assert.deepEqual(plain(assignedColorPhotos(added, beige)), [beigePhoto]);
  const colorless = { ...base, colors: [], colorImages: {}, colorPhotos: {} };
  const firstColor = immutable(colorless, (p) => toggleProductColor(p, black));
  assert.deepEqual(plain(assignedColorPhotos(firstColor, black)), [cover]);
  assert.equal(firstColor.image, cover);
});

test('validation normalizes galleries, synchronizes legacy first photos and roundtrips JSON', () => {
  const input = { ...base, colors: [black, beige, black],
    colorImages: { [black]: third, [beige]: ` ${beigePhoto} ` },
    colorPhotos: { [black]: [` ${cover} `, ' /api/images/abcd-1234.png '], [beige]: [] } };
  const validated = immutable(input, validateProduct);
  assert.deepEqual(plain(validated.colors), [black, beige]);
  assert.deepEqual(plain(validated.colorPhotos), { [black]: [cover, '/api/images/abcd-1234.png'] });
  assert.deepEqual(plain(validated.colorImages), { [black]: cover, [beige]: beigePhoto });
  assert.equal(validated.image, cover);
  const roundtrip = JSON.parse(JSON.stringify(validated));
  const validatedAgain = immutable(roundtrip, validateProduct);
  assert.deepEqual(plain(validatedAgain), plain(validated));
  assert.deepEqual(plain(productGallery(validatedAgain, black)), [cover, '/api/images/abcd-1234.png']);
  assert.deepEqual(plain(productGallery(validatedAgain, beige)), [beigePhoto]);
});

test('validation accepts legacy products and exactly ten distinct photos per selected color', () => {
  const legacy = immutable({ ...base, colorImages: { [black]: ` ${second} ` } }, validateProduct);
  assert.deepEqual(plain(legacy.colorPhotos), {});
  assert.deepEqual(plain(productGallery(legacy, black)), [second]);
  const images = Array.from({ length: MAX_COLOR_PHOTOS }, (_, i) => photo(`valid-${i}`));
  const validated = immutable({ ...base, colorPhotos: { [black]: images, [beige]: [beigePhoto] } }, validateProduct);
  assert.deepEqual(plain(validated.colorPhotos), { [black]: images, [beige]: [beigePhoto] });
  assert.equal(validated.colorImages[black], images[0]);
  assert.equal(validated.colorImages[beige], beigePhoto);
});

test('validation rejects invalid gallery shapes, unselected colors, duplicate photos and over-cap galleries', () => {
  const cases = [null, [], 'invalid', 123,
    { [grey]: [third] }, { 'not-a-color': [third] },
    { [black]: null }, { [black]: second }, { [black]: {} },
    { [black]: [cover, ` ${cover} `] },
    { [black]: Array.from({ length: MAX_COLOR_PHOTOS + 1 }, (_, i) => photo(`too-many-${i}`)) },
  ];
  for (const colorPhotos of cases) {
    const input = deepFreeze({ ...base, colorPhotos });
    assert.throws(() => validateProduct(input), undefined, JSON.stringify(colorPhotos));
  }
  for (const colors of [null, black, [black, 'not-a-color'], [42]]) {
    assert.throws(() => validateProduct(deepFreeze({ ...base, colors })));
  }
});

test('validation rejects invalid gallery URLs and non-string photo values', () => {
  const invalid = ['', '   ', 'not a URL', 'javascript:alert(1)', 'http://example.com/a.jpg',
    '/api/images/../bad.png', '/api/images/abcd.gif', `https://example.com/${'x'.repeat(2000)}`,
    null, 42, false, {}, []];
  for (const entry of invalid) {
    const input = deepFreeze({ ...base, colorPhotos: { [black]: [entry] } });
    assert.throws(() => validateProduct(input), undefined, `invalid photo ${JSON.stringify(entry)}`);
  }
  for (const colorImages of [null, [], { [grey]: third }, { [black]: 42 },
    { [black]: 'http://example.com/a.jpg' }, { [black]: '/api/images/../bad.png' }]) {
    assert.throws(() => validateProduct(deepFreeze({ ...base, colorImages })));
  }
});
