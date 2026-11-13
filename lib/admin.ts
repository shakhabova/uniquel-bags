import { getAdminUser } from "./auth";

export async function isAdmin() {
  return Boolean(await getAdminUser());
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function authorize(request: Request) {
  if (!(await isAdmin())) {
    return Response.json(
      { error: "Доступ разрешён только администратору" },
      { status: 403 },
    );
  }
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Недопустимый источник запроса" },
      { status: 403 },
    );
  }
  return null;
}
