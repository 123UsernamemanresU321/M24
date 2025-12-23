import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const portFile = path.join(root, '.arena-port');
const vitePort = 5173;

if (fs.existsSync(portFile)) {
  fs.unlinkSync(portFile);
}

const sharedBuild = spawnSync('npm', ['--prefix', 'shared', 'run', 'build'], {
  cwd: root,
  stdio: 'inherit'
});

if (sharedBuild.status !== 0) {
  process.exit(sharedBuild.status ?? 1);
}

const sharedWatch = spawn('npm', ['--prefix', 'shared', 'run', 'dev'], {
  cwd: root,
  stdio: 'inherit'
});

const serverEnv = {
  ...process.env,
  ARENA_PORT_FILE: portFile,
  ARENA_OPEN_URL: `http://localhost:${vitePort}`
};

const server = spawn('npm', ['--prefix', 'server', 'run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: serverEnv
});

server.on('exit', (code) => {
  sharedWatch.kill('SIGINT');
  process.exit(code ?? 0);
});

const waitForPort = () =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const interval = setInterval(() => {
      if (fs.existsSync(portFile)) {
        clearInterval(interval);
        try {
          const raw = fs.readFileSync(portFile, 'utf-8');
          const parsed = JSON.parse(raw);
          resolve(parsed.port);
        } catch (error) {
          reject(error);
        }
        return;
      }
      if (Date.now() - started > 10000) {
        clearInterval(interval);
        reject(new Error('Timed out waiting for server port file.'));
      }
    }, 200);
  });

const shutdown = () => {
  sharedWatch.kill('SIGINT');
  server.kill('SIGINT');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

waitForPort()
  .then((port) => {
    const clientEnv = {
      ...process.env,
      VITE_API_BASE: `http://localhost:${port}`
    };
    const client = spawn('npm', ['--prefix', 'client', 'run', 'dev'], {
      cwd: root,
      stdio: 'inherit',
      env: clientEnv
    });

    client.on('exit', (code) => {
      if (code !== 0) {
        sharedWatch.kill('SIGINT');
        server.kill('SIGINT');
      }
    });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    sharedWatch.kill('SIGINT');
    server.kill('SIGINT');
    process.exit(1);
  });
