// Runs the API server and the Vite dev server together (npm run dev).
// PORT = UI port (default 5173), API_PORT = API server port (default 5178).
import { spawn } from 'node:child_process';

const apiPort = process.env.API_PORT || '5178';
const uiPort = process.env.PORT || '5173';
const procs = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: apiPort } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', uiPort, '--strictPort'], { stdio: 'inherit', env: { ...process.env, API_PORT: apiPort } }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
