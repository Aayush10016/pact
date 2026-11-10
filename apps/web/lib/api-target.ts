/** Only evidence multipart POSTs may bypass the frontend function body limit. */
export function apiTarget(path: string, upload: boolean, origin?: string): string {
  const proxy = `/api/pact/${path}`;
  if (!upload || !origin) return proxy;
  if (!/^pacts\/[a-zA-Z0-9_-]+\/evidence(?:\/[a-zA-Z0-9_-]+\/versions)?$/.test(path)) return proxy;
  const target = new URL(origin);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('The secure evidence upload server is not configured correctly.');
  return `${target.origin}/v1/${path}`;
}
