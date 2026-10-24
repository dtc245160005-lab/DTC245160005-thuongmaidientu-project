'use strict';

// Đơn hàng NEXTECH lưu trong MySQL. Giá bán và mã giảm giá lấy từ mã nguồn
// (commerce-data.mjs), tồn kho lấy từ bảng nx_inventory; dữ liệu trình duyệt
// gửi lên chỉ gồm SKU, số lượng, địa chỉ và phương thức thanh toán.

const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');

const shared = Promise.all([
  import(pathToFileURL(path.join(__dirname, 'public', 'commerce-core.mjs')).href),
  import(pathToFileURL(path.join(__dirname, 'public', 'commerce-data.mjs')).href)
]).then(([core, data]) => ({ ...core, ...data }));

const ACTIVE_STATES = ['PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING'];
const ONLINE_METHODS = ['VNPAY_DEMO', 'MOMO_DEMO'];
const PAYMENT_TTL_MS = { BANK_DEMO: 24 * 60 * 60 * 1000, VNPAY_DEMO: 15 * 60 * 1000, MOMO_DEMO: 15 * 60 * 1000 };
const DB_UNAVAILABLE = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_NO_SUCH_TABLE'
]);
const IMAGE_TYPES = {
  'image/png': buf => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': buf => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/webp': buf => buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/gif': buf => buf.subarray(0, 4).toString('latin1') === 'GIF8'
};
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^0\d{9,10}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const text = (value, max) => String(value ?? '').trim().slice(0, max);

function validateAddress(input = {}) {
  const address = {
    name: text(input.name, 100),
    phone: String(input.phone ?? '').replace(/\s/g, ''),
    email: text(input.email, 255),
    province: text(input.province, 100),
    ward: text(input.ward, 100),
    detail: text(input.detail, 255),
    note: text(input.note, 500)
  };
  if (address.name.length < 2 || !phonePattern.test(address.phone) || !emailPattern.test(address.email) ||
      !address.province || !address.ward || address.detail.length < 5) {
    throw new HttpError(400, 'Vui lòng nhập đủ tên, điện thoại, email và địa chỉ giao hàng.');
  }
  return address;
}

function toOrder(row, items = []) {
  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    reservation: row.reservation,
    delivery: row.delivery,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    shipping: Number(row.shipping),
    total: Number(row.total),
    coupon: row.coupon,
    createdAt: new Date(row.created_at).toISOString(),
    items: items.map(item => ({
      sku: item.sku, name: item.product_name, variant: item.variant_label,
      unitPrice: Number(item.unit_price), qty: item.quantity
    }))
  };
}

// Sản phẩm do quản trị thêm, cùng dạng với catalog trong commerce-data.mjs.
// imageIndex là URL ảnh tải lên (giao diện hiểu chuỗi là đường dẫn ảnh, số là vị trí trong ảnh ghép).
function toProduct(row) {
  return {
    id: 1000 + row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    description: row.description,
    warranty: 'Bảo hành chính hãng 12 tháng',
    active: Boolean(row.active),
    server: true,
    imageIndex: row.has_image ? `/api/nextech/products/${row.sku}/image?v=${new Date(row.updated_at).getTime()}` : null,
    reserved: row.reserved,
    variants: [{
      sku: row.sku, label: 'Tiêu chuẩn', price: Number(row.price), oldPrice: Number(row.old_price),
      stock: row.on_hand, color: 'Đen'
    }]
  };
}

function makeNextechOrders({ pool, log, metrics, offlineFallback = false }) {
  let seeding = null;
  let warnedNoProductsTable = false;

  async function serverProducts({ includeHidden = false, sku = null } = {}, conn = pool) {
    try {
      const [rows] = await conn.query(`
        SELECT p.id, p.sku, p.slug, p.name, p.brand, p.category, p.description, p.price, p.old_price,
               p.active, p.image IS NOT NULL AS has_image, p.updated_at, i.on_hand, i.reserved
        FROM nx_products p JOIN nx_inventory i ON i.sku = p.sku
        WHERE (? OR p.active = 1) AND (? IS NULL OR p.sku = ?)
        ORDER BY p.id
      `, [includeHidden, sku, sku]);
      return rows.map(toProduct);
    } catch (error) {
      // Chưa chạy 04-nextech-products.sql: vẫn bán được sản phẩm có sẵn.
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      if (!warnedNoProductsTable) log('warn', 'nextech_products_table_missing', { hint: 'chạy db/init/04-nextech-products.sql' });
      warnedNoProductsTable = true;
      return [];
    }
  }

  // Tạo dòng tồn kho cho SKU mới trong catalog; không ghi đè số đã có.
  function ensureInventory() {
    seeding ??= shared.then(async ({ catalog }) => {
      const rows = catalog.flatMap(product => product.variants.map(variant => [variant.sku, variant.stock]));
      if (!rows.length) return;
      await pool.query('INSERT IGNORE INTO nx_inventory (sku, on_hand) VALUES ?', [rows]);
    }).catch(error => { seeding = null; throw error; });
    return seeding;
  }

  async function transaction(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback().catch(() => {});
      throw error;
    } finally {
      conn.release();
    }
  }

  async function itemsOf(conn, orderId) {
    const [items] = await conn.execute(
      'SELECT sku, product_name, variant_label, unit_price, quantity FROM nx_order_items WHERE order_id = ? ORDER BY id',
      [orderId]
    );
    return items;
  }

  async function addEvent(conn, orderId, status, actor, note = '') {
    await conn.execute(
      'INSERT INTO nx_order_events (order_id, status, actor, note) VALUES (?, ?, ?, ?)',
      [orderId, status, actor, note]
    );
  }

  async function adjustStock(conn, order, mode) {
    if (order.reservation !== 'RESERVED') return;
    for (const item of await itemsOf(conn, order.id)) {
      await conn.execute(
        mode === 'CONSUMED'
          ? 'UPDATE nx_inventory SET reserved = reserved - ?, on_hand = on_hand - ? WHERE sku = ?'
          : 'UPDATE nx_inventory SET reserved = reserved - ? WHERE sku = ?',
        mode === 'CONSUMED' ? [item.quantity, item.quantity, item.sku] : [item.quantity, item.sku]
      );
    }
    order.reservation = mode;
  }

  async function save(conn, order) {
    await conn.execute(
      'UPDATE nx_orders SET status = ?, payment_status = ?, reservation = ? WHERE id = ?',
      [order.status, order.paymentStatus, order.reservation, order.id]
    );
  }

  // Đơn thanh toán online/chuyển khoản quá hạn: hủy và trả tồn kho đang giữ.
  async function expireIfDue(conn, order, now = Date.now()) {
    const ttl = PAYMENT_TTL_MS[order.paymentMethod];
    if (!ttl || order.paymentStatus !== 'PENDING' || order.status === 'CANCELLED' ||
        now - new Date(order.createdAt).getTime() < ttl) return false;
    order.paymentStatus = 'FAILED';
    order.status = 'CANCELLED';
    await adjustStock(conn, order, 'RELEASED');
    await save(conn, order);
    await addEvent(conn, order.id, 'CANCELLED', 'expiry', 'Hết hạn thanh toán demo; tồn kho đã được giải phóng');
    return true;
  }

  async function lockOrder(conn, id) {
    const [[row]] = await conn.execute('SELECT * FROM nx_orders WHERE id = ? FOR UPDATE', [String(id).slice(0, 40)]);
    if (!row) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
    const order = toOrder(row);
    order.accessTokenHash = row.access_token_hash;
    await expireIfDue(conn, order);
    return order;
  }

  async function expirePending() {
    const [rows] = await pool.query(`
      SELECT id FROM nx_orders
      WHERE payment_status = 'PENDING' AND status <> 'CANCELLED'
        AND ((payment_method IN ('VNPAY_DEMO', 'MOMO_DEMO') AND created_at < NOW(3) - INTERVAL 15 MINUTE)
          OR (payment_method = 'BANK_DEMO' AND created_at < NOW(3) - INTERVAL 1 DAY))
      LIMIT 200
    `);
    for (const { id } of rows) await transaction(conn => lockOrder(conn, id));
  }

  async function createOrder(body) {
    const { catalog, seededCoupons, paymentMethods, quote } = await shared;
    const idempotencyKey = String(body?.idempotencyKey ?? '');
    const accessToken = String(body?.accessToken ?? '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(idempotencyKey) || !/^[A-Za-z0-9_-]{32,128}$/.test(accessToken)) {
      throw new HttpError(400, 'Mã đặt hàng không hợp lệ.');
    }
    if (!paymentMethods.includes(body?.paymentMethod)) throw new HttpError(400, 'Phương thức thanh toán không hợp lệ.');
    const lines = Array.isArray(body?.items) ? body.items.slice(0, 50).map(item => ({ sku: String(item?.sku ?? ''), qty: item?.qty })) : [];
    const address = validateAddress(body?.address);
    const delivery = body?.delivery === 'STORE' ? 'STORE' : 'HOME';
    const couponCode = text(body?.couponCode, 32).toUpperCase();
    const coupon = couponCode ? seededCoupons.find(c => c.code === couponCode && c.active) : null;
    if (couponCode && !coupon) throw new HttpError(400, 'Mã giảm giá không hợp lệ hoặc đã hết hiệu lực.');
    const tokenHash = sha256(accessToken);

    await ensureInventory();
    const existing = async conn => {
      const [[row]] = await conn.execute('SELECT * FROM nx_orders WHERE idempotency_key = ?', [idempotencyKey]);
      if (!row) return null;
      if (!sameHash(row.access_token_hash, tokenHash)) throw new HttpError(409, 'Mã đặt hàng đã được sử dụng.');
      return { ...toOrder(row, await itemsOf(conn, row.id)), duplicate: true };
    };

    try {
      return await transaction(async conn => {
        const previous = await existing(conn);
        if (previous) return previous;

        const skus = [...new Set(lines.map(line => line.sku))];
        const [stock] = skus.length
          ? await conn.query('SELECT sku, on_hand, reserved FROM nx_inventory WHERE sku IN (?) ORDER BY sku FOR UPDATE', [skus])
          : [[]];
        if (stock.length !== skus.length) throw new HttpError(409, 'Sản phẩm không còn bán.');
        const inventory = Object.fromEntries(stock.map(row => [row.sku, { onHand: row.on_hand, reserved: row.reserved }]));

        let price;
        try {
          const products = [...catalog, ...await serverProducts({ includeHidden: true }, conn)];
          price = quote(lines, products, inventory, coupon, delivery, address.province);
        } catch (error) {
          throw new HttpError(409, error.message);
        }

        const id = `NT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const online = body.paymentMethod !== 'COD';
        await conn.execute(`
          INSERT INTO nx_orders
            (id, idempotency_key, access_token_hash, customer_name, phone, email, province, ward,
             address_detail, note, delivery, payment_method, payment_status, status,
             subtotal, discount, shipping, total, coupon)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_CONFIRMATION', ?, ?, ?, ?, ?)
        `, [id, idempotencyKey, tokenHash, address.name, address.phone, address.email, address.province,
          address.ward, address.detail, address.note, delivery, body.paymentMethod,
          online ? 'PENDING' : 'UNPAID', price.subtotal, price.discount, price.shipping, price.total, price.coupon]);
        for (const item of price.items) {
          await conn.execute(
            'INSERT INTO nx_order_items (order_id, sku, product_name, variant_label, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?)',
            [id, item.sku, item.name, item.variant, item.unitPrice, item.qty]
          );
          await conn.execute('UPDATE nx_inventory SET reserved = reserved + ? WHERE sku = ?', [item.qty, item.sku]);
        }
        await addEvent(conn, id, 'PENDING_CONFIRMATION', 'customer', 'Đơn hàng được tạo');

        const [[row]] = await conn.execute('SELECT * FROM nx_orders WHERE id = ?', [id]);
        return toOrder(row, await itemsOf(conn, id));
      });
    } catch (error) {
      // Hai yêu cầu cùng mã chạy song song: yêu cầu sau trả lại đơn của yêu cầu trước.
      if (error.code === 'ER_DUP_ENTRY') {
        const previous = await transaction(existing);
        if (previous) return previous;
      }
      throw error;
    }
  }

  // Các thao tác đổi trạng thái giữ đúng luật của commerce-service.mjs.
  const customerActions = {
    async cancel(conn, order) {
      if (!ACTIVE_STATES.includes(order.status)) throw new HttpError(409, 'Đơn đã giao cần yêu cầu hỗ trợ thay vì tự hủy.');
      order.status = 'CANCELLED';
      if (order.paymentStatus === 'PAID') order.paymentStatus = 'REFUND_PENDING';
      await adjustStock(conn, order, 'RELEASED');
      return ['CANCELLED', ''];
    },
    async return(conn, order) {
      if (!['DELIVERED', 'COMPLETED'].includes(order.status)) throw new HttpError(409, 'Chỉ đơn đã giao mới có thể yêu cầu đổi trả.');
      order.status = 'RETURN_REQUESTED';
      return ['RETURN_REQUESTED', ''];
    },
    async payment(conn, order, body) {
      if (!ONLINE_METHODS.includes(order.paymentMethod) || order.paymentStatus !== 'PENDING') {
        throw new HttpError(409, 'Giao dịch demo không chờ thanh toán.');
      }
      const result = body?.result;
      if (!['PAID', 'FAILED'].includes(result)) throw new HttpError(400, 'Kết quả demo không hợp lệ.');
      order.paymentStatus = order.status === 'CANCELLED' && result === 'PAID' ? 'REFUND_PENDING' : result;
      return [`PAYMENT_${result}`, 'Kết quả giả lập, không phải giao dịch thật'];
    },
    async 'retry-payment'(conn, order) {
      if (order.status === 'CANCELLED') throw new HttpError(409, 'Đơn đã hủy không thể thanh toán lại.');
      if (!ONLINE_METHODS.includes(order.paymentMethod) || order.paymentStatus !== 'FAILED') {
        throw new HttpError(409, 'Đơn không thể thanh toán lại.');
      }
      order.paymentStatus = 'PENDING';
      return ['PAYMENT_RETRY', ''];
    }
  };

  const adminActions = {
    cancel: customerActions.cancel,
    async status(conn, order, body) {
      const { canTransition } = await shared;
      const next = String(body?.status ?? '');
      if (!canTransition(order, next)) throw new HttpError(409, 'Chuyển trạng thái không hợp lệ hoặc thanh toán chưa xác minh.');
      if (next === 'CANCELLED') {
        await adjustStock(conn, order, 'RELEASED');
        if (order.paymentStatus === 'PAID') order.paymentStatus = 'REFUND_PENDING';
      }
      if (next === 'SHIPPING') await adjustStock(conn, order, 'CONSUMED');
      order.status = next;
      return [next, ''];
    },
    async 'bank-verify'(conn, order) {
      if (order.status === 'CANCELLED') throw new HttpError(409, 'Đơn đã hủy cần đối soát và hoàn tiền nếu có giao dịch đến muộn.');
      if (order.paymentMethod !== 'BANK_DEMO' || order.paymentStatus !== 'PENDING') throw new HttpError(409, 'Đơn không chờ đối soát chuyển khoản.');
      order.paymentStatus = 'PAID';
      return ['PAYMENT_PAID', 'Đối soát giả lập; không có chuyển khoản thật'];
    },
    async 'cod-collected'(conn, order) {
      if (order.paymentMethod !== 'COD' || !['DELIVERED', 'COMPLETED'].includes(order.status) || order.paymentStatus !== 'UNPAID') {
        throw new HttpError(409, 'Chỉ ghi nhận COD khi đơn đã giao.');
      }
      order.paymentStatus = 'PAID';
      return ['PAYMENT_PAID', 'Xác nhận thu COD giả lập'];
    },
    async refund(conn, order) {
      if (order.paymentStatus !== 'REFUND_PENDING') throw new HttpError(409, 'Đơn này không chờ hoàn tiền.');
      order.paymentStatus = 'REFUNDED';
      return ['PAYMENT_REFUNDED', 'Hoàn tiền mô phỏng; không có giao dịch thật'];
    }
  };

  async function runAction(actions, actor, req) {
    if (!Object.hasOwn(actions, req.params.action)) throw new HttpError(404, 'Thao tác không tồn tại.');
    const action = actions[req.params.action];
    // Hủy đơn quá hạn trong giao dịch riêng để không bị rollback khi thao tác sau đó bị từ chối.
    await transaction(conn => lockOrder(conn, req.params.id));
    return transaction(async conn => {
      const order = await lockOrder(conn, req.params.id);
      if (actor === 'customer') {
        const token = String(req.get('x-order-token') || '');
        if (!sameHash(order.accessTokenHash, sha256(token))) throw new HttpError(403, 'Bạn không có quyền thao tác đơn này.');
      }
      const [event, note] = await action(conn, order, req.body);
      await save(conn, order);
      await addEvent(conn, order.id, event, actor, note);
      log('info', 'nextech_order_update', { order_id: order.id, action: req.params.action, actor, status: order.status });
      const [[row]] = await conn.execute('SELECT * FROM nx_orders WHERE id = ?', [order.id]);
      return toOrder(row, await itemsOf(conn, order.id));
    });
  }

  const handle = fn => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
      if (DB_UNAVAILABLE.has(error.code)) {
        log('error', 'nextech_db_unavailable', { code: error.code, error: error.message });
        return res.status(503).json({ error: 'Cơ sở dữ liệu tạm thời không khả dụng. Vui lòng thử lại sau.', offlineDemo: offlineFallback });
      }
      log('error', 'nextech_error', { route: req.path, error: error.message });
      return res.status(500).json({ error: 'Lỗi máy chủ' });
    }
  };

  const publicRouter = express.Router();
  publicRouter.post('/orders', handle(async (req, res) => {
    const order = await createOrder(req.body);
    if (!order.duplicate) {
      metrics.ordersCreated.inc();
      metrics.revenueTotal.inc(order.total);
      log('info', 'order_created', { order_id: order.id, total: order.total, items: order.items.length, source: 'nextech' });
    }
    res.status(order.duplicate ? 200 : 201).json(order);
  }));
  publicRouter.post('/orders/:id/:action', handle(async (req, res) => {
    res.json(await runAction(customerActions, 'customer', req));
  }));

  publicRouter.get('/products', handle(async (req, res) => {
    res.json(await serverProducts());
  }));
  publicRouter.get('/products/:sku/image', handle(async (req, res) => {
    const [[row]] = await pool.execute(
      'SELECT image, image_type FROM nx_products WHERE sku = ? AND image IS NOT NULL',
      [String(req.params.sku).slice(0, 32)]
    );
    if (!row) throw new HttpError(404, 'Không có ảnh.');
    res.set('Cache-Control', 'public, max-age=86400');
    res.type(row.image_type).send(row.image);
  }));

  const adminRouter = express.Router();
  adminRouter.post('/:id/:action', handle(async (req, res) => {
    res.json(await runAction(adminActions, 'admin', req));
  }));

  const integer = (value, min, max) => {
    const number = Number(value);
    return value !== '' && Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
  };
  const findProduct = async sku => {
    const [product] = await serverProducts({ includeHidden: true, sku: String(sku).slice(0, 32) });
    if (!product) throw new HttpError(404, 'Không tìm thấy sản phẩm.');
    return product;
  };

  // Quản trị thêm sản phẩm, tải ảnh, sửa giá / tồn kho / ẩn hiện. Ảnh lưu trong MySQL (MEDIUMBLOB).
  const adminProductsRouter = express.Router();
  adminProductsRouter.get('/', handle(async (req, res) => {
    res.json(await serverProducts({ includeHidden: true }));
  }));
  // Xóa sản phẩm khỏi cửa hàng. Dòng tồn kho được giữ lại vì đơn hàng cũ vẫn tham chiếu SKU.
  adminProductsRouter.delete('/:sku', handle(async (req, res) => {
    const { variants: [{ sku }] } = await findProduct(req.params.sku);
    await pool.execute('DELETE FROM nx_products WHERE sku = ?', [sku]);
    log('info', 'nextech_product_deleted', { sku });
    res.json({ ok: true, sku });
  }));
  adminProductsRouter.post('/', handle(async (req, res) => {
    const name = text(req.body?.name, 200);
    const brand = text(req.body?.brand, 100) || 'NEXTECH';
    const category = text(req.body?.category, 100) || 'Phụ kiện';
    const description = text(req.body?.description, 1000);
    const price = integer(req.body?.price, 0, 99999999999);
    const stock = integer(req.body?.stock, 0, 100000);
    if (name.length < 3 || price === null || stock === null) throw new HttpError(400, 'Dữ liệu sản phẩm không hợp lệ.');
    const sku = `NXU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await transaction(async conn => {
      await conn.execute('INSERT INTO nx_inventory (sku, on_hand) VALUES (?, ?)', [sku, stock]);
      await conn.execute(`
        INSERT INTO nx_products (sku, slug, name, brand, category, description, price, old_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [sku, `sp-${sku.toLowerCase()}`, name, brand, category, description, price, price]);
    });
    log('info', 'nextech_product_created', { sku, price, stock });
    res.status(201).json(await findProduct(sku));
  }));
  adminProductsRouter.put('/:sku/image', express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }), handle(async (req, res) => {
    const type = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!IMAGE_TYPES[type] || body.length < 12 || !IMAGE_TYPES[type](body)) {
      throw new HttpError(415, 'Chỉ nhận ảnh PNG, JPEG, WebP hoặc GIF.');
    }
    const { variants: [{ sku }] } = await findProduct(req.params.sku);
    await pool.execute('UPDATE nx_products SET image = ?, image_type = ? WHERE sku = ?', [body, type, sku]);
    log('info', 'nextech_product_image', { sku, bytes: body.length });
    res.json(await findProduct(sku));
  }));
  adminProductsRouter.post('/:sku', handle(async (req, res) => {
    const { variants: [{ sku }] } = await findProduct(req.params.sku);
    await transaction(async conn => {
      const [[stock]] = await conn.execute('SELECT reserved FROM nx_inventory WHERE sku = ? FOR UPDATE', [sku]);
      if (req.body?.price !== undefined) {
        const price = integer(req.body.price, 0, 99999999999);
        if (price === null) throw new HttpError(400, 'Giá không hợp lệ.');
        await conn.execute('UPDATE nx_products SET price = ? WHERE sku = ?', [price, sku]);
      }
      if (req.body?.stock !== undefined) {
        const onHand = integer(req.body.stock, 0, 100000);
        if (onHand === null || onHand < stock.reserved) throw new HttpError(400, 'Tồn kho không hợp lệ hoặc thấp hơn số đã giữ.');
        await conn.execute('UPDATE nx_inventory SET on_hand = ? WHERE sku = ?', [onHand, sku]);
      }
      if (req.body?.active !== undefined) {
        await conn.execute('UPDATE nx_products SET active = ? WHERE sku = ?', [req.body.active ? 1 : 0, sku]);
      }
    });
    log('info', 'nextech_product_updated', { sku });
    res.json(await findProduct(sku));
  }));

  return { publicRouter, adminRouter, adminProductsRouter, expirePending, ensureInventory };
}

module.exports = { makeNextechOrders, HttpError };
