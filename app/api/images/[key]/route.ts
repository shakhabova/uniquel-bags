import { readImage } from '@/lib/storage';

const contentTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))
    return new Response('Not found', { status: 404 });

  try {
    const bytes = await readImage(key);
    if (!bytes) return new Response('Not found', { status: 404 });
    return new Response(bytes, {
      headers: {
        'Content-Type':
          contentTypes[key.split('.').at(-1) || ''] ||
          'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Internal Server Error', { status: 500 });
  }
}
