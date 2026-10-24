// Kiểm thử với MySQL thật. Chạy khi có biến NX_TEST_DB_PORT (và tùy chọn NX_TEST_DB_HOST/USER/PASSWORD/NAME),
// ví dụ MySQL tạm khởi tạo bằng db/init. Không có biến này thì bỏ qua.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createApp}=require('../server.js');
const {hashPassword}=require('../admin-auth.cjs');

const port=process.env.NX_TEST_DB_PORT;
const skip=port?false:'đặt NX_TEST_DB_PORT để chạy với MySQL';
const env={
  NODE_ENV:'production',DB_HOST:process.env.NX_TEST_DB_HOST||'127.0.0.1',DB_PORT:port,
  DB_USER:process.env.NX_TEST_DB_USER||'app',DB_PASSWORD:process.env.NX_TEST_DB_PASSWORD||'apppw',DB_NAME:process.env.NX_TEST_DB_NAME||'thuongmaidientu',
  ADMIN_EMAIL:'admin@test.local',ADMIN_PASSWORD_HASH:hashPassword('Admin@12345')
};
const address={name:'Nguyễn Văn A',phone:'0912345678',email:'a@example.com',province:'Hà Nội',ward:'Dịch Vọng',detail:'Số 12 Xuân Thủy'};
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');

let ctx;
async function setup(){
  const {app,pool,nextech}=createApp(env);
  await nextech.ensureInventory();
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body,headers={})=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:response.status,body:await response.json(),headers:response.headers};};
  const stock=async sku=>{const [[row]]=await pool.execute('SELECT on_hand,reserved FROM nx_inventory WHERE sku=?',[sku]);return row;};
  const login=await post('/api/admin/login',{email:env.ADMIN_EMAIL,password:'Admin@12345'});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const order=(sku,qty,extra={})=>{const accessToken=token();return post('/api/nextech/orders',{idempotencyKey:crypto.randomUUID(),accessToken,paymentMethod:'COD',items:[{sku,qty}],address,...extra}).then(r=>({...r,accessToken}));};
  // Cửa hàng không còn sản phẩm mẫu cố định: mỗi test tự tạo sản phẩm qua API quản trị.
  const product=async(price,stock)=>(await post('/api/admin/products',{name:'Sản phẩm test',price,stock},{Cookie:cookie})).body.variants[0].sku;
  ctx={base,pool,server,post,stock,cookie,order,product};
}

test('NEXTECH orders persist in MySQL',{skip},async t=>{
  await setup();
  t.after(async()=>{await new Promise(resolve=>ctx.server.close(resolve));await ctx.pool.end();});
  const {post,stock,cookie,order,pool,base,product}=ctx;

  await t.test('server prices the order, reserves stock and is idempotent',async()=>{
    const sku=await product(42990000,7),before=await stock(sku);
    const accessToken=token(),body={idempotencyKey:crypto.randomUUID(),accessToken,paymentMethod:'COD',couponCode:'NEX10',items:[{sku,qty:2}],address};
    const first=await post('/api/nextech/orders',body);
    assert.equal(first.status,201);
    assert.equal(first.body.subtotal,42990000*2);
    assert.equal(first.body.discount,Math.round(42990000*2*.1));
    assert.equal(first.body.total,first.body.subtotal-first.body.discount);
    assert.equal((await stock(sku)).reserved,before.reserved+2);
    const again=await post('/api/nextech/orders',body);
    assert.equal(again.status,200);
    assert.equal(again.body.id,first.body.id);
    assert.equal((await stock(sku)).reserved,before.reserved+2);
    const stolen=await post('/api/nextech/orders',{...body,accessToken:token()});
    assert.equal(stolen.status,409);
  });

  await t.test('client-side prices are ignored and overselling is rejected',async()=>{
    const sku=await product(7490000,5),available=(await stock(sku)).on_hand-(await stock(sku)).reserved;
    const tooMany=await post('/api/nextech/orders',{idempotencyKey:crypto.randomUUID(),accessToken:token(),paymentMethod:'COD',items:[{sku,qty:available+1,unitPrice:1}],total:1,address});
    assert.equal(tooMany.status,409);
    const results=await Promise.all(Array.from({length:available+3},()=>order(sku,1)));
    assert.equal(results.filter(r=>r.status===201).length,available);
    const row=await stock(sku);
    assert.equal(row.reserved,row.on_hand);
  });

  await t.test('customer actions need the order token; cancel releases stock',async()=>{
    const sku=await product(5290000,17),before=await stock(sku);
    const created=await order(sku,1);
    const path=`/api/nextech/orders/${created.body.id}/cancel`;
    assert.equal((await post(path,{},{'X-Order-Token':token()})).status,403);
    const cancelled=await post(path,{},{'X-Order-Token':created.accessToken});
    assert.equal(cancelled.status,200);
    assert.equal(cancelled.body.status,'CANCELLED');
    assert.deepEqual(await stock(sku),before);
    assert.equal((await post(path,{},{'X-Order-Token':created.accessToken})).status,409);
  });

  await t.test('online payment gates shipping; shipping consumes stock once',async()=>{
    const sku=await product(4290000,19),before=await stock(sku);
    const created=await order(sku,1,{paymentMethod:'MOMO_DEMO'});
    const id=created.body.id,auth={'X-Order-Token':created.accessToken},adminHeaders={Cookie:cookie};
    assert.equal(created.body.paymentStatus,'PENDING');
    const confirmed=await post(`/api/admin/orders/${id}/status`,{status:'CONFIRMED'},adminHeaders);
    assert.equal(confirmed.body.status,'CONFIRMED',JSON.stringify(confirmed.body));
    assert.equal((await post(`/api/admin/orders/${id}/status`,{status:'PREPARING'},adminHeaders)).status,409);
    assert.equal((await post(`/api/nextech/orders/${id}/payment`,{result:'FAILED'},auth)).body.paymentStatus,'FAILED');
    assert.equal((await post(`/api/nextech/orders/${id}/retry-payment`,{},auth)).body.paymentStatus,'PENDING');
    assert.equal((await post(`/api/nextech/orders/${id}/payment`,{result:'PAID'},auth)).body.paymentStatus,'PAID');
    await post(`/api/admin/orders/${id}/status`,{status:'PREPARING'},adminHeaders);
    const shipped=await post(`/api/admin/orders/${id}/status`,{status:'SHIPPING'},adminHeaders);
    assert.equal(shipped.body.reservation,'CONSUMED');
    assert.deepEqual(await stock(sku),{on_hand:before.on_hand-1,reserved:before.reserved});
    assert.equal((await post(`/api/admin/orders/${id}/status`,{status:'SHIPPING'},adminHeaders)).status,409);
    assert.equal((await post(`/api/admin/orders/${id}/status`,{status:'DELIVERED'})).status,401);
    const [events]=await pool.execute('SELECT status FROM nx_order_events WHERE order_id=? ORDER BY id',[id]);
    assert.deepEqual(events.map(e=>e.status),['PENDING_CONFIRMATION','CONFIRMED','PAYMENT_FAILED','PAYMENT_RETRY','PAYMENT_PAID','PREPARING','SHIPPING']);
  });

  await t.test('expired online payment is cancelled and its stock released',async()=>{
    const sku=await product(2190000,6),before=await stock(sku);
    const created=await order(sku,1,{paymentMethod:'VNPAY_DEMO'});
    await pool.execute('UPDATE nx_orders SET created_at = NOW(3) - INTERVAL 16 MINUTE WHERE id=?',[created.body.id]);
    const late=await post(`/api/nextech/orders/${created.body.id}/payment`,{result:'PAID'},{'X-Order-Token':created.accessToken});
    assert.equal(late.status,409);
    const [[row]]=await pool.execute('SELECT status,payment_status FROM nx_orders WHERE id=?',[created.body.id]);
    assert.deepEqual(row,{status:'CANCELLED',payment_status:'FAILED'});
    assert.deepEqual(await stock(sku),before);
  });

  await t.test('created orders are counted in Prometheus metrics',async()=>{
    const metrics=await (await fetch(`${base}/metrics`)).text();
    const count=Number(metrics.match(/^thuongmaidientu_orders_created_total (\d+)/m)?.[1]);
    const [[{n}]]=await pool.query('SELECT COUNT(*) AS n FROM nx_orders');
    assert.ok(count>0&&count<=n);
  });

  await t.test('admin adds a product with an uploaded image and customers can order it',async()=>{
    const json={'Content-Type':'application/json'};
    const create=body=>fetch(`${base}/api/admin/products`,{method:'POST',headers:{...json,Cookie:cookie},body:JSON.stringify(body)});
    assert.equal((await fetch(`${base}/api/admin/products`,{method:'POST',headers:json,body:'{"name":"Không quyền","price":1,"stock":1}'})).status,401);
    assert.equal((await create({name:'X',price:-1,stock:1})).status,400);
    const created=await create({name:'Loa Bluetooth Mini',brand:'JBL',category:'Âm thanh',price:990000,stock:3});
    assert.equal(created.status,201);
    const product=await created.json(),sku=product.variants[0].sku;
    assert.equal(product.imageIndex,null);

    const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f30000000049454e44ae426082','hex');
    const upload=(body,type)=>fetch(`${base}/api/admin/products/${sku}/image`,{method:'PUT',headers:{'Content-Type':type,Cookie:cookie},body});
    assert.equal((await upload(Buffer.from('<svg></svg>'),'image/png')).status,415);
    assert.equal((await upload(png,'image/svg+xml')).status,415);
    const uploaded=await (await upload(png,'image/png')).json();
    assert.match(uploaded.imageIndex,new RegExp(`^/api/nextech/products/${sku}/image\\?v=\\d+$`));
    const image=await fetch(base+uploaded.imageIndex);
    assert.equal(image.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);

    const listed=await (await fetch(`${base}/api/nextech/products`)).json();
    assert.ok(listed.some(p=>p.variants[0].sku===sku));
    const ordered=await order(sku,2);
    assert.equal(ordered.status,201);
    assert.equal(ordered.body.subtotal,990000*2);
    assert.equal((await order(sku,2)).status,409);

    const hidden=await post(`/api/admin/products/${sku}`,{active:false,price:500000},{Cookie:cookie});
    assert.equal(hidden.body.active,false);
    assert.ok(!(await (await fetch(`${base}/api/nextech/products`)).json()).some(p=>p.variants[0].sku===sku));
    assert.equal((await order(sku,1)).status,409);
    assert.equal((await post(`/api/admin/products/${sku}`,{stock:1},{Cookie:cookie})).status,400);
  });
});
