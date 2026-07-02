const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');

const backendPort = process.env.BACKEND_PORT || '8003';
const backendHost = process.env.BACKEND_HOST || '127.0.0.1';
const backendUrl = `http://${backendHost}:${backendPort}`;
const pythonCmd = process.env.PYTHON || 'python';
const npmCommand = process.platform === 'win32'
  ? {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm run dev'],
    }
  : {
      command: 'npm',
      args: ['run', 'dev'],
    };

const children = new Set();
let shuttingDown = false;

function startProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || rootDir,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[dev] ${label} exited with ${signal || code}`);
      shutdown(code || 1);
    }
  });

  child.on('error', (error) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[dev] ${label} failed: ${error.message}`);
      shutdown(1);
    }
  });

  return child;
}

function waitForBackend(timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(`${backendUrl}/api/v1/`, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Backend did not respond at ${backendUrl}`));
          return;
        }
        setTimeout(check, 500);
      });

      request.setTimeout(1500, () => {
        request.destroy();
      });
    };

    check();
  });
}

function killTree(child) {
  if (!child.pid) return;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    killTree(child);
  }

  setTimeout(() => process.exit(exitCode), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  console.log(`[dev] Starting Django at ${backendUrl}`);
  startProcess(
    'backend',
    pythonCmd,
    ['manage.py', 'runserver', `${backendPort}`],
    { cwd: backendDir }
  );

  await waitForBackend();
  console.log('[dev] Backend is ready. Starting Vite.');

  startProcess('frontend', npmCommand.command, npmCommand.args, {
    cwd: frontendDir,
    env: {
      VITE_API_URL: process.env.VITE_API_URL || '/api/v1',
      VITE_PROXY_TARGET: process.env.VITE_PROXY_TARGET || backendUrl,
      BACKEND_HOST: backendHost,
      BACKEND_PORT: backendPort,
    },
  });
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  shutdown(1);
});
