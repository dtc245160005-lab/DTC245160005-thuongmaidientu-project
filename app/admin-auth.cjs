'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const COOKIE_NAME = 'nx_admin_session';
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function loadLocalAdminConfig() {
  if (process.env.NODE_ENV === 'production') return;
  const filename = path.join(__dirname, '.env.local');
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 200) return false;
  const parts = String(encoded || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const actual = crypto.scryptSync(password, Buffer.from(parts[1], 'hex'), 64);
  const expected = Buffer.from(parts[2], 'hex');
  return crypto.timingSafeEqual(actual, expected);
}

function makeAdminRouter({ email, passwordHash }) {
  const router = express.Router();
  const sessions = new Map();
  const failures = new Map();
  const cookieOptions = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api/admin' });
  const tokenKey = token => crypto.createHash('sha256').update(token).digest('hex');
  const readToken = req => {
    const raw = req.headers.cookie || '';
    const cookie = raw.split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_NAME}=`));
    return cookie ? cookie.slice(COOKIE_NAME.length + 1) : null;
  };
  const authorized = req => {
    const token = readToken(req);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const key = tokenKey(token), session = sessions.get(key);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) { sessions.delete(key); return false; }
    return true;
  };
  router.post('/login', (req, res) => {
    if (!email || !passwordHash) return res.status(503).json({ error: 'Tài khoản quản trị chưa được cấu hình trên máy chủ.' });
    const remote = req.ip || 'unknown', now = Date.now();
    const bucket = failures.get(remote);
    if (bucket && now - bucket.since < LOGIN_WINDOW_MS && bucket.count >= MAX_FAILURES) {
      return res.status(429).json({ error: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
    }
    const identifier = String(req.body?.email || '').trim().toLowerCase();
    const valid = verifyPassword(req.body?.password, passwordHash);
    if (identifier !== email.toLowerCase() || !valid) {
      const current = bucket && now - bucket.since < LOGIN_WINDOW_MS ? bucket : { since: now, count: 0 };
      current.count += 1; failures.set(remote, current);
      return res.status(401).json({ error: 'Email hoặc mật khẩu quản trị không đúng.' });
    }
    failures.delete(remote);
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(tokenKey(token), { email, expiresAt: now + SESSION_LIFETIME_MS });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: SESSION_LIFETIME_MS });
    return res.json({ role: 'ADMIN_DEMO', email, expiresAt: new Date(now + SESSION_LIFETIME_MS).toISOString() });
  });
  router.get('/session', (req, res) => {
    if (!authorized(req)) return res.status(401).json({ error: 'Chưa đăng nhập quản trị.' });
    return res.json({ role: 'ADMIN_DEMO', email });
  });
  router.post('/logout', (req, res) => {
    const token = readToken(req);
    if (token) sessions.delete(tokenKey(token));
    res.clearCookie(COOKIE_NAME, cookieOptions(req));
    return res.json({ ok: true });
  });
  return router;
}

module.exports = { loadLocalAdminConfig, hashPassword, verifyPassword, makeAdminRouter };
