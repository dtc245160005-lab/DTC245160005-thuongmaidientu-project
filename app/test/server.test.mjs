import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {createApp,trustProxySetting}=require('../server.js');
const {hashPassword}=require('../admin-auth.cjs');

const admin={ADMIN_EMAIL:'admin@test.local',ADMIN_PASSWORD_HASH:hashPassword('Admin@12345')};
// DB_PORT trỏ vào cổng đóng để test chạy được khi không có MySQL.
const noDb={DB_HOST:'127.0.0.1',DB_PORT:'1',DB_USER:'x',DB_PASSWORD:'x',DB_NAME:'x'};

async function serve(env){
  const {app,pool}=createApp(env);
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  return {base,close:async()=>{await new Promise(resolve=>server.close(resolve));await pool.end();}};
}

test('trust proxy is off unless configured',()=>{
  assert.equal(trustProxySetting(undefined),false);
  assert.equal(trustProxySetting('false'),false);
  assert.equal(trustProxySetting('1'),1);
  assert.deepEqual(trustProxySetting('loopback, uniquelocal'),['loopback','uniquelocal']);
});

test('spoofed X-Forwarded-For cannot bypass admin login limit without a trusted proxy',async()=>{
  const {base,close}=await serve({...noDb,...admin,NODE_ENV:'production'});
  try{
    const statuses=[];
    for(let i=0;i<6;i++){
      const response=await fetch(`${base}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':`203.0.113.${i}`},body:JSON.stringify({email:admin.ADMIN_EMAIL,password:'wrong-password'})});
      statuses.push(response.status);
    }
    assert.deepEqual(statuses,[401,401,401,401,401,429]);
  }finally{await close();}
});

test('debug error route is disabled in production unless explicitly enabled',async()=>{
  const off=await serve({...noDb,NODE_ENV:'production'});
  try{assert.equal((await fetch(`${off.base}/api/debug/error`)).status,404);}finally{await off.close();}
  const on=await serve({...noDb,NODE_ENV:'production',ENABLE_DEBUG_ROUTES:'true'});
  try{assert.equal((await fetch(`${on.base}/api/debug/error`)).status,500);}finally{await on.close();}
});

test('order API reports offline demo only outside production when MySQL is down',async()=>{
  const body=JSON.stringify({idempotencyKey:'offline-test-1',accessToken:'a'.repeat(64),paymentMethod:'COD',items:[{sku:'NX-001-STD',qty:1}],address:{name:'Nguyễn Văn A',phone:'0912345678',email:'a@example.com',province:'Hà Nội',ward:'Dịch Vọng',detail:'Số 12 Xuân Thủy'}});
  for(const [env,offline] of [['development',true],['production',false]]){
    const {base,close}=await serve({...noDb,NODE_ENV:env});
    try{
      const response=await fetch(`${base}/api/nextech/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body});
      assert.equal(response.status,503);
      assert.equal((await response.json()).offlineDemo,offline);
    }finally{await close();}
  }
});

test('admin order actions require the admin session',async()=>{
  const {base,close}=await serve({...noDb,...admin,NODE_ENV:'production'});
  try{
    const response=await fetch(`${base}/api/admin/orders/NT-1/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"status":"CONFIRMED"}'});
    assert.equal(response.status,401);
  }finally{await close();}
});
