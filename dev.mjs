import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const children = [
  spawn(process.execPath, [path.join(root, 'server.mjs')], {
    cwd: root,
    env: { ...process.env, SYMPLA_API_ONLY: '1' },
    stdio: 'inherit',
  }),
  spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
  }),
];

let stopping = false;
function stopChildren(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}

for (const child of children) {
  child.on('error', error => {
    console.error('Não foi possível iniciar um dos servidores locais.', error);
    stopChildren();
    process.exitCode = 1;
  });
  child.on('exit', code => {
    if (!stopping) {
      process.exitCode = code || 0;
      stopChildren();
    }
  });
}

process.on('SIGINT', () => stopChildren('SIGINT'));
process.on('SIGTERM', () => stopChildren('SIGTERM'));
