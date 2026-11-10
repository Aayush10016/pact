import { describe, expect, it } from 'vitest';
import { resumeSameRoute } from '../../web/lib/resume-same-route';
describe('Clerk same-route continuation', () => {
  it('preserves verified identity headers without proxying the page back to itself', () => {
    const response = new Response(null, {
      headers: {
        'x-middleware-rewrite': 'http://localhost:3000/sign-in',
        'x-middleware-override-headers': 'x-clerk-auth-status',
        'x-middleware-request-x-clerk-auth-status': 'signed-out',
      },
    });
    resumeSameRoute(response, 'http://localhost:3000/sign-in');
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-clerk-auth-status')).toBe('signed-out');
    expect(response.headers.get('x-middleware-override-headers')).toBe('x-clerk-auth-status');
  });
  it('preserves an intentional rewrite to a different route', () => {
    const response = new Response(null, {
      headers: { 'x-middleware-rewrite': 'http://localhost:3000/__clerk' },
    });
    resumeSameRoute(response, 'http://localhost:3000/sign-in');
    expect(response.headers.get('x-middleware-rewrite')).toBe('http://localhost:3000/__clerk');
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });
  it('preserves sign-in redirects', () => {
    const response = new Response(null, { status: 307, headers: { location: '/sign-in' } });
    resumeSameRoute(response, 'http://localhost:3000/workspace');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/sign-in');
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });
});
