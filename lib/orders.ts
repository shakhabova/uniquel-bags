import { productGallery, money, type Product } from './products';

export type OrderItem = {
  productId: string;
  name: string;
  color: string;
  image: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export type Order = {
  id: string;
  createdAt: string;
  items: OrderItem[];
  total: number;
};

export function snapshotOrderItems(value: unknown, products: Product[]) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error('В корзине должно быть от 1 до 100 позиций');
  }
  const seen = new Set<string>();
  return value.map((item: unknown): OrderItem => {
    if (!item || typeof item !== 'object') throw new Error('Проверьте состав корзины');
    const { productId, color, quantity } = item as Record<string, unknown>;
    if (typeof productId !== 'string' || typeof color !== 'string' ||
        typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('Проверьте товар, цвет и количество');
    }
    const product = products.find(p => p.id === productId && !p.archived);
    if (!product) throw new Error('Один из товаров больше недоступен. Обновите каталог');
    if (product.colors.length ? !product.colors.includes(color) : color !== '') {
      throw new Error('Выбранный цвет больше недоступен. Обновите каталог');
    }
    const key = JSON.stringify([productId, color]);
    if (seen.has(key)) throw new Error('Одинаковые позиции в корзине нужно объединить');
    seen.add(key);
    const priceCents = Math.round(product.price * 100);
    return {
      productId, name: product.name, color,
      image: productGallery(product, color)[0] || '/image-unavailable.svg',
      quantity, price: priceCents / 100, subtotal: priceCents * quantity / 100,
    };
  });
}

export function orderTotal(items: OrderItem[]) {
  return items.reduce((sum, item) => sum + Math.round(item.subtotal * 100), 0) / 100;
}

export function orderMessage(order: Order, url: string) {
  return 'Здравствуйте! Хочу заказать:\n' + order.items.map(item =>
    item.name + (item.color ? ' · ' + item.color : '') + ' · ' + item.quantity +
    ' шт. · ' + money(item.subtotal),
  ).join('\n') + '\nИтого: ' + money(order.total) + '\n\nЗаказ с фотографиями: ' + url;
}
