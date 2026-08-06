// 一键启动开发环境：前端 Vite 开发服务器 + 后端 Express
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';

function run(command, args, cwd) {
  // Windows 上通过 shell 运行以正确解析 npm.cmd
  return spawn(command, args, {
    cwd,
    shell: isWindows,
    stdio: 'inherit',
    env: process.env,
  });
}

const client = run('npm', ['run', 'dev'], path.join(root, 'client'));
const server = run('node', ['index.js'], path.join(root, 'server'));

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    client.kill();
  } catch {}
  try {
    server.kill();
  } catch {}
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.on('exit', (code) => {
  if (!shuttingDown) {
    console.log('\n前端进程已退出（代码 ' + code + '），停止后端…');
    shutdown();
  }
});
server.on('exit', (code) => {
  if (!shuttingDown) {
    console.log('\n后端进程已退出（代码 ' + code + '），停止前端…');
    shutdown();
  }
});

console.log('🚀 已启动：前端 http://localhost:5173 · 后端 http://127.0.0.1:3000');
console.log('按 Ctrl+C 可同时停止前后端。');
