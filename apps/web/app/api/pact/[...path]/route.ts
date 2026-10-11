import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const joined = path.join('/');
  if (
    !/^(?:pacts|me|activity|invitations|capabilities|support|staff|sellers)(?:\/[a-zA-Z0-9_-]+)*$/.test(
      joined,
    )
  )
    return Response.json({ error: { message: 'Route not found.' } }, { status: 404 });
  const token = request.headers.get('authorization');
  if (!token?.startsWith('Bearer ') || token.length > 8192)
    return Response.json(
      { error: { message: 'A verified session is required.' } },
      { status: 403 },
    );
  const headers = new Headers({ authorization: token });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const key = request.headers.get('idempotency-key');
  if (key) headers.set('idempotency-key', key);
  let body: ArrayBuffer | undefined;
  if (request.method === 'POST') {
    if (Number(request.headers.get('content-length') || 0) > 9 * 1024 * 1024)
      return Response.json({ error: { message: 'Upload is too large.' } }, { status: 413 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (request.body) {
      const reader = request.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 9 * 1024 * 1024) {
          await reader.cancel();
          return Response.json({ error: { message: 'Upload is too large.' } }, { status: 413 });
        }
        chunks.push(value);
      }
    }
    body = Uint8Array.from(Buffer.concat(chunks)).buffer;
  }
  try {
    const response = await fetch(
      `${process.env.API_ORIGIN || 'http://127.0.0.1:4000'}/v1/${joined}`,
      {
        method: request.method,
        headers,
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(45000),
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  } catch {
    return Response.json(
      {
        error: {
          message:
            'Pact could not confirm the server response. Your request may already be saved. Refresh the record before retrying; do not start another payment.',
        },
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
