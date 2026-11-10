import { readFileSync, writeFileSync } from 'node:fs';
process.loadEnvFile('.env');
const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const domain = Buffer.from(key.split('_').slice(2).join('_'), 'base64')
  .toString()
  .replace(/\$$/, '');
if (!/^[a-z0-9.-]+\.clerk\.accounts\.dev$/.test(domain))
  throw new Error('Expected Clerk development domain');
const issuer = `https://${domain}`;
const response = await fetch(`${issuer}/.well-known/jwks.json`, {
  signal: AbortSignal.timeout(15000),
});
if (!response.ok || !(await response.json()).keys?.length)
  throw new Error('Clerk JWKS unavailable');
if (process.env.CLERK_ISSUER === 'https://clerk.example.com') {
  const content = readFileSync('.env', 'utf8').replace(
    /^CLERK_ISSUER=.*$/m,
    `CLERK_ISSUER=${issuer}`,
  );
  writeFileSync('.env', content);
  console.log('Placeholder issuer replaced with verified public-key domain.');
} else if (process.env.CLERK_ISSUER !== issuer) {
  throw new Error('Clerk issuer does not match publishable key');
}
console.log('Clerk public domain and JWKS: PASS. Interactive identity still requires sign-in.');
