import { beforeAll, expect, it } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { verifySession } from '../src/auth/auth.module';
let key: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  key = await generateKeyPair('RS256');
});
async function token(changes: Record<string, unknown> = {}) {
  return new SignJWT({
    sub: 'user_one',
    sid: 'session_one',
    azp: 'https://pact.example',
    ...changes,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://auth.example')
    .setNotBefore('0s')
    .setExpirationTime('5m')
    .sign(key.privateKey);
}
it('verifies signed sessions and rejects forged signatures', async () => {
  expect(
    (
      await verifySession(
        await token(),
        key.publicKey,
        'https://auth.example',
        'https://pact.example',
      )
    ).sub,
  ).toBe('user_one');
  const wrong = await generateKeyPair('RS256');
  await expect(
    verifySession(await token(), wrong.publicKey, 'https://auth.example', 'https://pact.example'),
  ).rejects.toThrow();
});
it('rejects wrong issuer, wrong origin, pending sessions and malformed JWTs', async () => {
  await expect(
    verifySession(await token(), key.publicKey, 'https://evil.example', 'https://pact.example'),
  ).rejects.toThrow();
  for (const changes of [{ azp: 'https://evil.example' }, { sid: null }, { sts: 'pending' }])
    await expect(
      verifySession(
        await token(changes),
        key.publicKey,
        'https://auth.example',
        'https://pact.example',
      ),
    ).rejects.toThrow();
  await expect(
    verifySession('not.a.token', key.publicKey, 'https://auth.example', 'https://pact.example'),
  ).rejects.toThrow();
});
it('rejects expired tokens and unexpected algorithms', async () => {
  const expired = await new SignJWT({ sub: 'u', sid: 's', azp: 'https://pact.example' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://auth.example')
    .setNotBefore(1)
    .setExpirationTime(2)
    .sign(key.privateKey);
  await expect(
    verifySession(expired, key.publicKey, 'https://auth.example', 'https://pact.example'),
  ).rejects.toThrow();
});
