import { adminLogoutCookie } from "@/lib/auth";
import { sameOrigin } from "@/lib/admin";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json(
      { error: "Недоступный источник запроса" },
      { status: 403 },
    );
  }
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": adminLogoutCookie(),
        "Cache-Control": "no-store",
      },
    },
  );
}
