// 本地联调开发机 PM2 配置
// - shou-api-server 走 `nest start --watch`，改 TS 即时重启，无需手动 build
// - shou-pay-server 走编译产物；代码改动后需 `pnpm -F api build && pm2 restart shou-pay-server`
// - shou-import-worker 走编译产物；代码改动后需 `pnpm -F api build && pm2 restart shou-import-worker`
// 前置：首次启动前执行 `pnpm -F @shou/types build && pnpm -F api build`
module.exports = {
  apps: [
    {
      name: 'shou-api-server',
      script: 'pnpm',
      args: '-F api start:dev',
      interpreter: 'none',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      time: true,
    },
    {
      name: 'shou-pay-server',
      script: 'pnpm',
      args: '-F api start:payment-api',
      interpreter: 'none',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PAYMENT_PORT: '3001',
      },
      error_file: 'logs/pay-error.log',
      out_file: 'logs/pay-out.log',
      time: true,
    },
    {
      name: 'shou-import-worker',
      script: 'pnpm',
      args: '-F api start:import-worker',
      interpreter: 'none',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        IMPORT_JOB_WORKER_ENABLED: 'true',
      },
      error_file: 'logs/import-error.log',
      out_file: 'logs/import-out.log',
      time: true,
    },
  ],
};
