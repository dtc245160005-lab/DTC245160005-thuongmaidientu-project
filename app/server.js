'use strict';

const express = require('express');
const mysql = require('mysql2/promise');
const client = require('prom-client');
const path = require('path');
const { loadLocalAdminConfig, makeAdminRouter } = require('./admin-auth.cjs');

loadLocalAdminConfig();

const PORT = Number(process.env.PORT || 3000);

function log(level, msg, extra = {}) {
  process.stdout.write(JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...extra
  }) + '\n');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'thuongmaidientu_' });

const httpRequests = new client.Counter({
  name: 'thuongmaidientu_http_requests_total',
  help: 'Tong so HTTP request',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const httpDuration = new client.Histogram({
  name: 'thuongmaidientu_http_request_duration_seconds',
  help: 'Thoi gian xu ly HTTP request',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register]
});

const ordersCreated = new client.Counter({
  name: 'thuongmaidientu_orders_created_total',
  help: 'So don hang da tao',
  registers: [register]
});

const revenueTotal = new client.Counter({
  name: 'thuongmaidientu_revenue_vnd_total',
  help: 'Tong gia tri don hang VND',
  registers: [register]
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const route = req.route
      ? (Array.isArray(req.route.path) ? req.path : req.baseUrl + req.route.path)
      : (req.path.startsWith('/api') ? 'unknown' : 'static');
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode)
    };

    httpRequests.inc(labels);
    httpDuration.observe(labels, seconds);

    if (route !== '/metrics' && route !== '/api/health') {
      const level = res.statusCode >= 500 ? 'error'
        : res.statusCode >= 400 ? 'warn' : 'info';
      log(level, 'http_request', {
        method: req.method,
        route,
        status: res.statusCode,
        duration_ms: Math.round(seconds * 1000)
      });
    }
  });

  next();
});

app.use('/api/admin', makeAdminRouter({ email: process.env.ADMIN_EMAIL, passwordHash: process.env.ADMIN_PASSWORD_HASH }));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.get(['/login', '/register', '/admin', '/admin/login', '/orders', '/orders/:id', '/cart', '/checkout', '/payment-demo/:id', '/profile', '/products/:slug'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const isToken = value =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const toInt = value => {
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
};

app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
}));

app.get('/api/categories', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name FROM categories ORDER BY id'
  );
  res.json(rows);
}));

app.get('/api/products', wrap(async (req, res) => {
  let sql = `
    SELECT p.id, p.name, p.description, p.price, p.stock, p.emoji,
           c.name AS category
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE 1 = 1
  `;
  const params = [];
  const category = toInt(req.query.category);

  if (category > 0) {
    sql += ' AND p.category_id = ?';
    params.push(category);
  }

  if (req.query.q) {
    sql += ' AND p.name LIKE ?';
    params.push('%' + String(req.query.q).slice(0, 50) + '%');
  }

  sql += ' ORDER BY p.id';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

app.get('/api/products/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  if (!(id > 0)) {
    return res.status(400).json({ error: 'ID khong hop le' });
  }

  const [rows] = await pool.execute(`
    SELECT p.id, p.name, p.description, p.price, p.stock, p.emoji,
           c.name AS category
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `, [id]);

  if (!rows.length) {
    return res.status(404).json({ error: 'Khong tim thay san pham' });
  }

  res.json(rows[0]);
}));

async function getCart(token) {
  const [items] = await pool.execute(`
    SELECT ci.product_id, p.name, p.emoji, p.price, p.stock, ci.quantity,
           (p.price * ci.quantity) AS subtotal
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_token = ?
    ORDER BY ci.added_at
  `, [token]);

  const total = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
  return { token, items, total };
}

app.get('/api/cart/:token', wrap(async (req, res) => {
  if (!isToken(req.params.token)) {
    return res.status(400).json({ error: 'Token khong hop le' });
  }

  res.json(await getCart(req.params.token));
}));

app.post('/api/cart/:token/items', wrap(async (req, res) => {
  const token = req.params.token;
  const productId = toInt(req.body?.productId);
  const quantity = toInt(req.body?.quantity ?? 1);

  if (!isToken(token) || !(productId > 0) ||
      !(quantity >= 1 && quantity <= 99)) {
    return res.status(400).json({ error: 'Du lieu khong hop le' });
  }

  const [[product]] = await pool.execute(
    'SELECT id, stock FROM products WHERE id = ?',
    [productId]
  );

  if (!product) {
    return res.status(404).json({ error: 'Khong tim thay san pham' });
  }

  await pool.execute(`
    INSERT INTO cart_items (cart_token, product_id, quantity)
    VALUES (?, ?, ?) AS new
    ON DUPLICATE KEY UPDATE
      quantity = LEAST(cart_items.quantity + new.quantity, 99)
  `, [token, productId, quantity]);

  log('info', 'cart_add', {
    cart: token.slice(0, 8),
    product_id: productId,
    quantity
  });

  res.status(201).json(await getCart(token));
}));

app.put('/api/cart/:token/items/:productId', wrap(async (req, res) => {
  const token = req.params.token;
  const productId = toInt(req.params.productId);
  const quantity = toInt(req.body?.quantity);

  if (!isToken(token) || !(productId > 0) ||
      !(quantity >= 0 && quantity <= 99)) {
    return res.status(400).json({ error: 'Du lieu khong hop le' });
  }

  if (quantity === 0) {
    await pool.execute(
      'DELETE FROM cart_items WHERE cart_token = ? AND product_id = ?',
      [token, productId]
    );
  } else {
    await pool.execute(
      'UPDATE cart_items SET quantity = ? WHERE cart_token = ? AND product_id = ?',
      [quantity, token, productId]
    );
  }

  res.json(await getCart(token));
}));

app.delete('/api/cart/:token/items/:productId', wrap(async (req, res) => {
  const token = req.params.token;
  const productId = toInt(req.params.productId);

  if (!isToken(token) || !(productId > 0)) {
    return res.status(400).json({ error: 'Du lieu khong hop le' });
  }

  await pool.execute(
    'DELETE FROM cart_items WHERE cart_token = ? AND product_id = ?',
    [token, productId]
  );

  res.json(await getCart(token));
}));

app.post('/api/orders', wrap(async (req, res) => {
  const cartToken = req.body?.cartToken;
  const name = String(req.body?.customerName || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const address = String(req.body?.address || '').trim();

  if (!isToken(cartToken)) {
    return res.status(400).json({ error: 'Token khong hop le' });
  }
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'Ho ten khong hop le' });
  }
  if (!/^0\d{9,10}$/.test(phone)) {
    return res.status(400).json({ error: 'So dien thoai khong hop le' });
  }
  if (address.length < 5 || address.length > 255) {
    return res.status(400).json({ error: 'Dia chi khong hop le' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [items] = await conn.execute(`
      SELECT ci.product_id, ci.quantity, p.name, p.price, p.stock
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_token = ?
      FOR UPDATE
    `, [cartToken]);

    if (!items.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Gio hang trong' });
    }

    const lack = items.find(item => item.quantity > item.stock);
    if (lack) {
      await conn.rollback();
      return res.status(409).json({
        error: `San pham "${lack.name}" chi con ${lack.stock}`
      });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );

    const [result] = await conn.execute(
      `INSERT INTO orders (cart_token, customer_name, phone, address, total)
       VALUES (?, ?, ?, ?, ?)`,
      [cartToken, name, phone, address, total]
    );

    for (const item of items) {
      await conn.execute(
        `INSERT INTO order_items
           (order_id, product_id, product_name, unit_price, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, item.product_id, item.name, item.price, item.quantity]
      );
      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    await conn.execute(
      'DELETE FROM cart_items WHERE cart_token = ?',
      [cartToken]
    );
    await conn.commit();

    ordersCreated.inc();
    revenueTotal.inc(total);
    log('info', 'order_created', {
      order_id: result.insertId,
      total,
      items: items.length
    });

    res.status(201).json({ orderId: result.insertId, total });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.get('/api/orders', wrap(async (req, res) => {
  const token = req.query.cartToken;
  if (!isToken(token)) {
    return res.status(400).json({ error: 'Token khong hop le' });
  }

  const [orders] = await pool.execute(`
    SELECT id, customer_name, phone, address, total, status, created_at
    FROM orders
    WHERE cart_token = ?
    ORDER BY id DESC
    LIMIT 50
  `, [token]);

  for (const order of orders) {
    const [items] = await pool.execute(
      `SELECT product_name, unit_price, quantity
       FROM order_items WHERE order_id = ?`,
      [order.id]
    );
    order.items = items;
  }

  res.json(orders);
}));

app.get('/api/debug/error', (req, res, next) => {
  next(new Error('Simulated error for log demo'));
});

app.get('/metrics', wrap(async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON khong hop le' });
  }

  log('error', 'unhandled_error', {
    route: req.route?.path || 'unknown',
    error: error.message
  });
  res.status(500).json({ error: 'Loi may chu' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  log('info', 'server_started', { port: PORT });
});

function shutdown(signal) {
  log('info', 'shutdown', { signal });
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
