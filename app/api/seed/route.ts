import { authorize } from "@/lib/admin";
import { seedSamples } from "@/lib/store";
export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  try {
    await seedSamples();
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Не удалось добавить примеры" },
      { status: 503 },
    );
  }
}
