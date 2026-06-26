const fs = require('fs');
const path = require('path');

const TARGET_DIRS = [
  path.join(__dirname, '../apps/api/src'),
  path.join(__dirname, '../packages/types/src'),
  path.join(__dirname, '../packages/utils/src'),
];

const BASELINE = {
  "apps/api/src/auth/auth.service.ts": 431,
  "apps/api/src/payment/payment-initiation.service.ts": 423,
  "apps/api/src/payment/payment-query.service.ts": 601,
  "apps/api/src/printing-template-package/printing-template-package.service.ts": 452,
  "apps/api/src/settings/settings-payment-config.service.ts": 485,
  "apps/api/src/tenant/os-tenant-lifecycle.service.ts": 472,
  "packages/types/src/contracts/order.ts": 737,
  "packages/types/src/contracts/tenant.ts": 527
};

const LIMITS = {
  service: 400, // *.service.ts
  default: 500  // other *.ts
};

function getFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(getFiles(fullPath));
    } else if (stat.isFile() && item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

let violations = [];
let checkedCount = 0;

for (const dir of TARGET_DIRS) {
  const files = getFiles(dir);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    // Normalize newlines and count
    const lines = content.split(/\r?\n/);
    const lineCount = lines.length;
    
    const relativePath = path.relative(path.join(__dirname, '..'), file);

    const isService = file.endsWith('.service.ts');
    const standardLimit = isService ? LIMITS.service : LIMITS.default;
    
    checkedCount++;
    
    // Check baseline or standard limit
    if (BASELINE[relativePath] !== undefined) {
      const allowedLimit = BASELINE[relativePath];
      if (lineCount > allowedLimit) {
        violations.push({
          file: relativePath,
          lineCount,
          limit: allowedLimit,
          type: 'baseline (historical limit)'
        });
      }
    } else {
      if (lineCount > standardLimit) {
        violations.push({
          file: relativePath,
          lineCount,
          limit: standardLimit,
          type: isService ? 'service' : 'default'
        });
      }
    }
  }
}

console.log(`[File Limits Check] Checked ${checkedCount} files.`);
if (violations.length > 0) {
  console.error('\x1b[31m[ERROR] File size limit violations found:\x1b[0m');
  for (const v of violations) {
    console.error(`  - ${v.file}: ${v.lineCount} lines (Limit: ${v.limit} lines for ${v.type})`);
  }
  process.exit(1);
} else {
  console.log('\x1b[32m[SUCCESS] All files are within size limits.\x1b[0m');
  process.exit(0);
}
