import { Logo } from '@/components/logo';
import type { Product } from '@/lib/products';
import AdminLoginForm from '@/components/admin-login-form';
import { getAdminUser } from '@/lib/auth';
import AdminPanel from '@/components/admin-panel';
import { listProducts } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Управление каталогом — UNIQUEL BAGS',
  robots: { index: false, follow: false },
};

export default async function Admin() {
  const user = await getAdminUser();
  if (!user) {
    return (
      <main className="admin-login">
        <Logo />
        <div className="login-card">
          <p className="eyebrow">ПАНЕЛЬ АДМИНИСТРАТОРА</p>
          <h1>Добро пожаловать</h1>
          <p>Войдите с учётными данными администратора магазина.</p>
          <AdminLoginForm />
          <a className="detail-contact" href="/">
            Вернуться в каталог
          </a>
        </div>
      </main>
    );
  }

  let products: Product[] = [];
  let error = '';
  try {
    products = await listProducts(true);
  } catch {
    error = 'Не удалось загрузить товары. Попробуйте ещё раз.';
  }
  return (
    <AdminPanel
      initialProducts={products}
      email={user.email}
      initialError={error}
    />
  );
}
