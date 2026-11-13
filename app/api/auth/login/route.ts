import {
  adminSessionCookie,
  createAdminSession,
  verifyAdminCredentials,
} from '@/lib/auth';
import { sameOrigin } from '@/lib/admin';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: 'Недопустимый источник запроса' },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    if (
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      !verifyAdminCredentials(body.email, body.password)
    ) {
      return Response.json(
        { error: 'Неверный email или пароль' },
        { status: 401 },
      );
    }

    return Response.json(
      { ok: true },
      {
        headers: {
          'Set-Cookie': adminSessionCookie(createAdminSession()),
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch {
    return Response.json(
      { error: 'Не удалось войти. Проверьте настройки сервера.' },
      { status: 400 },
    );
  }
}
