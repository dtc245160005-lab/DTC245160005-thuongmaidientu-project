import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoCommerceService} from '../public/commerce-service.mjs';
import {quote,canTransition} from '../public/commerce-core.mjs';

class MemoryStorage{data=new Map();getItem(key){return this.data.get(key)??null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
const address={name:'Nguyễn Văn A',phone:'0912345678',email:'a@example.com',province:'Hà Nội',ward:'Dịch Vọng',detail:'Số 12 đường Xuân Thủy'};
const make=()=>new DemoCommerceService(new MemoryStorage(),new MemoryStorage());

test('quote validates combined quantity for duplicate SKU',()=>{
  const service=make(),sku=service.products()[0].variants[0].sku;
  assert.throws(()=>quote([{sku,qty:7},{sku,qty:7}],service.data.products,service.data.inventory,null),/chỉ còn/);
});
test('cart, coupon, idempotency, reservation and cancellation stay consistent',()=>{
  const service=make(),sku=service.products()[0].variants[0].sku,start=service.available(sku);
  service.addCart(sku,2);
  const before=service.estimate(service.selectedLines(),'NEX10');
  assert.equal(before.discount,Math.round(before.subtotal*.1));
  const input={address,paymentMethod:'COD',couponCode:'NEX10',idempotencyKey:'click-1'};
  const order=service.placeOrder(input);
  assert.equal(service.available(sku),start-2);
  assert.equal(service.cartCount(),0);
  assert.equal(service.placeOrder(input).id,order.id);
  assert.equal(service.orders().length,1);
  service.cancel(order.id);
  assert.equal(service.available(sku),start);
  assert.equal(service.order(order.id).status,'CANCELLED');
});
test('online demo payment blocks shipping until paid and consumes stock once',()=>{
  const service=make(),sku=service.products()[1].variants[0].sku,start=service.available(sku);
  service.addCart(sku,1);
  const order=service.placeOrder({address,paymentMethod:'VNPAY_DEMO',idempotencyKey:'pay-1'});
  service.enterAdminPreview();
  service.transition(order.id,'CONFIRMED');
  assert.equal(canTransition(order,'PREPARING'),false);
  service.logout();service.simulatePayment(order.id,'FAILED');service.retryPayment(order.id);service.simulatePayment(order.id,'PAID');
  service.enterAdminPreview();service.transition(order.id,'PREPARING');service.transition(order.id,'SHIPPING');
  assert.equal(service.data.inventory[sku].onHand,start-1);
  assert.equal(service.data.inventory[sku].reserved,0);
  assert.throws(()=>service.transition(order.id,'SHIPPING'));
});
test('orders are scoped to owner in demo storage',async()=>{
  const service=make(),sku=service.products()[0].variants[0].sku;
  service.addCart(sku);const order=service.placeOrder({address,paymentMethod:'COD'});
  await service.register({name:'Khách hàng B',email:'b@example.com',phone:'0987654321',password:'password123'});
  await service.login('b@example.com','password123');
  assert.equal(service.orders().length,0);
  assert.throws(()=>service.order(order.id),/quyền/);
});
test('registration saves account but requires login before using it',async()=>{
  const service=make(),sku=service.products()[0].variants[0].sku;
  service.addCart(sku);
  const account=await service.register({name:'Khách hàng Mới',email:'new@example.com',phone:'0987654321',password:'password123'});
  assert.equal(account.email,'new@example.com');
  assert.equal(service.session,null);
  assert.equal(service.cartCount(),1);
  await assert.rejects(service.login('new@example.com','wrong-password'),/không đúng/);
  assert.equal(service.session,null);
  await service.login('new@example.com','password123');
  assert.equal(service.session.email,'new@example.com');
  assert.equal(service.cartCount(),1);
});
test('buy now leaves existing cart unchanged',()=>{
  const service=make(),sku=service.products()[0].variants[0].sku;
  service.addCart(sku,2);service.sessionStorage.setItem('nx_buy_now',JSON.stringify({sku,qty:1}));
  service.placeOrder({address,paymentMethod:'COD',lines:[{sku,qty:1}]});
  assert.equal(service.cartCount(),2);
});
test('variants have separate cart lines and repeat add combines one SKU',()=>{
  const service=make(),[first,second]=service.products()[0].variants;
  service.addCart(first.sku);service.addCart(first.sku);service.addCart(second.sku);
  assert.deepEqual(service.cart().map(x=>x.qty),[2,1]);
  service.changeQty(first.sku,1);assert.equal(service.cart()[0].qty,1);
  service.removeCart(second.sku);assert.equal(service.cart().length,1);
  assert.throws(()=>service.addCart(first.sku,0),/không hợp lệ/);
  assert.throws(()=>service.changeQty(first.sku,100),/tồn kho/);
});
test('cart persists on reload but does not reserve inventory',()=>{
  const storage=new MemoryStorage(),session=new MemoryStorage(),first=new DemoCommerceService(storage,session),sku=first.products()[0].variants[0].sku,start=first.available(sku);
  first.addCart(sku,2);
  const next=new DemoCommerceService(storage,session);
  assert.equal(next.cartCount(),2);
  assert.equal(next.available(sku),start);
});
test('checkout rejects missing address, invalid coupon and out of stock',()=>{
  const service=make(),sku=service.products()[0].variants[0].sku;
  service.addCart(sku);
  assert.throws(()=>service.placeOrder({address:{...address,phone:''},paymentMethod:'COD'}),/địa chỉ/);
  assert.throws(()=>service.placeOrder({address,paymentMethod:'COD',couponCode:'WRONG'}),/Mã giảm giá/);
  service.data.inventory[sku].onHand=0;
  assert.throws(()=>service.placeOrder({address,paymentMethod:'COD'}),/chỉ còn/);
});
test('admin transition rules, reserved stock and customer access',()=>{
  const service=make(),sku=service.products()[0].variants[0].sku;
  assert.throws(()=>service.adjustStock(sku,10),/quản trị/);
  service.addCart(sku);const order=service.placeOrder({address,paymentMethod:'COD'});
  service.enterAdminPreview();
  assert.throws(()=>service.transition(order.id,'COMPLETED'),/không hợp lệ/);
  service.transition(order.id,'CONFIRMED');service.transition(order.id,'PREPARING');service.transition(order.id,'SHIPPING');
  assert.equal(service.data.inventory[sku].reserved,0);
  assert.throws(()=>service.cancel(order.id),/Đơn đã giao/);
  service.transition(order.id,'DELIVERED');service.markCodCollected(order.id);
  assert.equal(service.metrics().revenue,order.total);
  service.logout();assert.equal(service.session,null);
  assert.throws(()=>service.metrics(),/quản trị/);
});
test('late demo payment on cancelled order is flagged for refund',()=>{
  const service=make(),sku=service.products()[0].variants[0].sku;
  service.addCart(sku);const order=service.placeOrder({address,paymentMethod:'MOMO_DEMO'});
  service.cancel(order.id);
  service.simulatePayment(order.id,'PAID');
  assert.equal(order.paymentStatus,'REFUND_PENDING');
  assert.equal(service.data.inventory[sku].reserved,0);
  assert.throws(()=>service.retryPayment(order.id));
  service.enterAdminPreview();service.markRefundedDemo(order.id);
  assert.equal(order.paymentStatus,'REFUNDED');
  assert.throws(()=>service.markRefundedDemo(order.id));
});
test('expired online demo order releases reserved stock once',()=>{
  const service=make(),sku=service.products()[0].variants[0].sku,start=service.available(sku);
  service.addCart(sku);const order=service.placeOrder({address,paymentMethod:'VNPAY_DEMO'});
  service.expirePendingPayments(new Date(order.createdAt).getTime()+16*60*1000);
  assert.equal(order.status,'CANCELLED');
  assert.equal(order.paymentStatus,'FAILED');
  assert.equal(service.available(sku),start);
  service.expirePendingPayments(new Date(order.createdAt).getTime()+17*60*1000);
  assert.equal(service.data.inventory[sku].reserved,0);
});
