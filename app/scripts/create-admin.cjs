'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('../admin-auth.cjs');

const filename = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(filename)) {
  process.stderr.write('app/.env.local đã tồn tại. Hãy sao lưu hoặc xóa file đó trước khi tạo lại tài khoản.\n');
  process.exit(1);
}
const email = 'admin@nextech.local';
const password = `Nx@${crypto.randomBytes(15).toString('base64url')}`;
fs.writeFileSync(filename, `ADMIN_EMAIL=${email}\nADMIN_PASSWORD_HASH=${hashPassword(password)}\n`, { mode: 0o600, flag: 'wx' });
process.stdout.write(`Tài khoản quản trị local\nEmail: ${email}\nMật khẩu: ${password}\nCấu hình đã lưu tại app/.env.local (không đưa lên Git).\n`);
