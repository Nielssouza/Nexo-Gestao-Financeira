const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const indexPath = path.join(frontendDir, 'dist', 'index.html');
const prune = process.argv.includes('--prune');
const cleanInstall = process.argv.includes('--ci');
const ifMissing = process.argv.includes('--if-missing');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(`[build] Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runNpm(args, options = {}) {
  if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], options);
    return;
  }

  run('npm', args, options);
}

function removeNodeModules() {
  const nodeModulesPath = path.join(frontendDir, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
  }
}

if (ifMissing && fs.existsSync(indexPath)) {
  console.log(`[build] React build already exists at ${indexPath}`);
  process.exit(0);
}

runNpm([cleanInstall ? 'ci' : 'install', '--include=dev'], { cwd: frontendDir });
runNpm(['run', 'build'], {
  cwd: frontendDir,
  env: {
    VITE_API_URL: process.env.VITE_API_URL || '/api/v1',
  },
});

if (!fs.existsSync(indexPath)) {
  console.error(`[build] React build not found at ${indexPath}`);
  process.exit(1);
}

if (prune) {
  removeNodeModules();
}

console.log(`[build] React build ready at ${indexPath}`);
