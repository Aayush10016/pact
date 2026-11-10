import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.NVIDIA_NIM_API_KEY || !process.env.NVIDIA_NIM_MODEL)
  throw new Error('Configure local NVIDIA values; never paste them into chat.');
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const result = spawnSync(python, ['-m', 'evaluations.live', ...process.argv.slice(2)], {
  cwd: 'apps/ai',
  env: process.env,
  stdio: 'inherit',
  timeout: 300000,
});
process.exitCode = result.status ?? 1;
