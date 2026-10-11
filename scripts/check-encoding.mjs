import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/);
let invalid = false;
for (const file of new Set(files)) {
  if (!/\.(?:tsx?|jsx?|mjs|json|md|css|html|ya?ml|sql|py|toml|txt)$/.test(file)) continue;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
    if (text.includes('\uFFFD')) throw new Error('literal Unicode replacement character');
  } catch (error) {
    console.error(`${file}: ${error instanceof Error ? error.message : 'invalid UTF-8'}`);
    invalid = true;
  }
}
if (invalid) process.exitCode = 1;
else
  console.log('Tracked source and documentation are valid UTF-8 without replacement characters.');
