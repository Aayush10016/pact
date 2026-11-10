/** Preserve Clerk's verified request headers while resuming an unchanged local route.
 * Next may otherwise treat the same-page absolute rewrite as external when a container
 * binds 0.0.0.0 or a loopback hostname differs from the incoming hostname.
 */
export function resumeSameRoute<T extends { headers: Headers }>(
  response: T,
  requestUrl: string,
): T {
  if (response.headers.get('x-middleware-rewrite') === requestUrl) {
    response.headers.delete('x-middleware-rewrite');
    response.headers.set('x-middleware-next', '1');
  }
  return response;
}
