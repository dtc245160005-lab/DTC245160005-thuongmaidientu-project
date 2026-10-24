import {catalog,seededCoupons} from './commerce-data.mjs';
import {availableStock,canTransition,integerQuantity,paymentMethods,quote} from './commerce-core.mjs';

const clone=value=>structuredClone(value);
const uid=()=>crypto.randomUUID();
const key='nx_commerce_v1';
const demoCustomer={email:'demo@nextech.vn',password:'Nextech@2026',name:'Demo NEXTECH'};
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern=/^0\d{9,10}$/;
const newData=()=>({
  products:clone(catalog),inventory:Object.fromEntries(catalog.flatMap(p=>p.variants.map(v=>[v.sku,{onHand:v.stock,reserved:0}]))),
  carts:{},orders:[],users:[],coupons:clone(seededCoupons),audit:[],guestId:uid()
});
const hash=async(salt,password)=>{
  const data=new TextEncoder().encode(`${salt}:${password}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
};

export class DemoCommerceService {
  constructor(storage=localStorage,sessionStorageApi=sessionStorage){
    this.storage=storage;
    this.sessionStorage=sessionStorageApi;
    try{this.data=JSON.parse(storage.getItem(key))||newData();}catch{this.data=newData();}
    try{this.session=JSON.parse(sessionStorageApi.getItem('nx_commerce_session'))||null;}catch{this.session=null;}
    if(!storage.getItem(key)){
      // Keep the cart created by the first NEXTECH preview.
      try{const old=JSON.parse(storage.getItem('nx_cart')||'[]');this.data.carts[`g:${this.data.guestId}`]=old.filter(x=>this.data.products[x.id-1]).map(x=>({sku:this.data.products[x.id-1].variants[0].sku,qty:Math.min(99,Number(x.qty)||1),selected:true}));}catch{}
      this.save();
    }
    this.expirePendingPayments();
  }
  save(){this.storage.setItem(key,JSON.stringify(this.data));}
  setSession(session){this.session=session;if(session)this.sessionStorage.setItem('nx_commerce_session',JSON.stringify(session));else this.sessionStorage.removeItem('nx_commerce_session');}
  owner(){return this.session?.role==='CUSTOMER'?`u:${this.session.email}`:`g:${this.data.guestId}`;}
  requireAdmin(){if(this.session?.role!=='ADMIN_DEMO')throw new Error('Cần vào chế độ quản trị demo.');}
  requireCustomerOwner(order){if(this.session?.role==='ADMIN_DEMO')return;if(order.owner!==this.owner())throw new Error('Bạn không có quyền xem đơn này.');}
  products(){return this.data.products.filter(p=>p.active);}
  allProducts(){this.requireAdmin();return this.data.products;}
  product(slug){return this.data.products.find(p=>p.slug===slug&&p.active);}
  bySku(sku){for(const product of this.data.products){const variant=product.variants.find(v=>v.sku===sku);if(variant)return{product,variant};}return null;}
  available(sku){this.expirePendingPayments();const result=this.bySku(sku);return result?availableStock(this.data.inventory,result.variant):0;}
  cart(owner=this.owner()){return this.data.carts[owner]||[];}
  cartCount(){return this.cart().reduce((sum,line)=>sum+line.qty,0);}
  addCart(sku,qty=1){
    const found=this.bySku(sku);
    if(!found?.product.active)throw new Error('Sản phẩm không còn bán.');
    if(!integerQuantity(qty))throw new Error('Số lượng không hợp lệ.');
    const cart=this.cart(),line=cart.find(x=>x.sku===sku),available=this.available(sku);
    if((line?.qty||0)+Number(qty)>available)throw new Error(`Chỉ còn ${available} sản phẩm có thể mua.`);
    if(line)line.qty+=Number(qty);else cart.push({sku,qty:Number(qty),selected:true});
    this.data.carts[this.owner()]=cart;this.save();return cart;
  }
  changeQty(sku,qty){
    const line=this.cart().find(x=>x.sku===sku);
    if(!line)throw new Error('Sản phẩm không có trong giỏ.');
    if(!integerQuantity(qty)||Number(qty)>this.available(sku))throw new Error('Số lượng vượt tồn kho có thể mua.');
    line.qty=Number(qty);this.save();
  }
  removeCart(sku){this.data.carts[this.owner()]=this.cart().filter(x=>x.sku!==sku);this.save();}
  selectCart(sku,selected){const line=this.cart().find(x=>x.sku===sku);if(line)line.selected=!!selected;this.save();}
  selectAll(selected){this.cart().forEach(line=>{line.selected=!!selected;});this.save();}
  selectedLines(){return this.cart().filter(line=>line.selected);}
  coupon(code){return this.data.coupons.find(c=>c.code===String(code||'').trim().toUpperCase()&&c.active)||null;}
  estimate(lines=this.selectedLines(),couponCode='',delivery='HOME',region=''){
    if(couponCode&&!this.coupon(couponCode))throw new Error('Mã giảm giá không hợp lệ hoặc đã hết hiệu lực.');
    return quote(lines,this.data.products,this.data.inventory,this.coupon(couponCode),delivery,region);
  }
  async register({name,email,phone,password}){
    name=String(name||'').trim();email=String(email||'').trim().toLowerCase();phone=String(phone||'').replace(/\s/g,'');
    if(name.length<2||!emailPattern.test(email)||!phonePattern.test(phone)||String(password||'').length<8)throw new Error('Thông tin đăng ký chưa hợp lệ.');
    if(email===demoCustomer.email||this.data.users.some(u=>u.email===email))throw new Error('Email đã được sử dụng.');
    const salt=uid(),record={name,email,phone,salt,hash:await hash(salt,password),locked:false,addresses:[]};
    this.data.users.push(record);this.save();this.setSession(null);return{email,name};
  }
  async login(identifier,password){
    identifier=String(identifier||'').trim().toLowerCase();
    const user=this.data.users.find(u=>u.email===identifier||u.phone===identifier);
    if(user?.locked)throw new Error('Tài khoản đã bị khóa trong bản demo.');
    if(identifier===demoCustomer.email&&password===demoCustomer.password){this.loginCustomer(demoCustomer);return;}
    if(!user||await hash(user.salt,password)!==user.hash)throw new Error('Tài khoản hoặc mật khẩu không đúng.');
    this.loginCustomer(user);
  }
  loginCustomer(user){
    const guest=this.cart(`g:${this.data.guestId}`),owner=`u:${user.email}`,target=this.cart(owner);
    for(const line of guest){const existing=target.find(x=>x.sku===line.sku),space=Math.max(0,this.available(line.sku)-(existing?.qty||0));if(existing)existing.qty+=Math.min(space,line.qty);else if(space)target.push({...line,qty:Math.min(space,line.qty)});}
    this.data.carts[owner]=target;this.data.carts[`g:${this.data.guestId}`]=[];
    this.setSession({role:'CUSTOMER',email:user.email,name:user.name});this.save();
  }
  enterAdminPreview(){
    // Call only after /api/admin/login or /api/admin/session succeeds.
    // Browser state is still a demo store, not server-side authorization.
    this.setSession({role:'ADMIN_DEMO',name:'Quản trị demo'});
  }
  logout(){this.setSession(null);}
  profile(){
    if(this.session?.role!=='CUSTOMER')return null;
    if(this.session.email===demoCustomer.email)return this.data.users.find(u=>u.email===demoCustomer.email)||{name:demoCustomer.name,email:demoCustomer.email,phone:'',addresses:[]};
    return this.data.users.find(u=>u.email===this.session.email)||null;
  }
  saveProfile({name,phone}){
    if(this.session?.role!=='CUSTOMER')throw new Error('Hãy đăng nhập để sửa hồ sơ.');
    name=String(name||'').trim();phone=String(phone||'').replace(/\s/g,'');
    if(name.length<2||!phonePattern.test(phone))throw new Error('Tên hoặc số điện thoại không hợp lệ.');
    let record=this.data.users.find(u=>u.email===this.session.email);
    if(!record){record={name,email:this.session.email,phone,addresses:[],locked:false};this.data.users.push(record);}
    record.name=name;record.phone=phone;this.session.name=name;this.setSession(this.session);this.save();
  }
  saveAddress(address){
    const profile=this.profile();if(!profile)throw new Error('Hãy đăng nhập để lưu địa chỉ.');
    const result=this.validateAddress(address);
    let record=this.data.users.find(u=>u.email===profile.email);
    if(!record){record={...profile,addresses:[]};this.data.users.push(record);}
    record.addresses.push({id:uid(),...result});this.save();
  }
  validateAddress(input){
    const name=String(input.name||'').trim(),phone=String(input.phone||'').replace(/\s/g,''),email=String(input.email||'').trim(),province=String(input.province||'').trim(),ward=String(input.ward||'').trim(),detail=String(input.detail||'').trim();
    if(name.length<2||!phonePattern.test(phone)||!emailPattern.test(email)||!province||!ward||detail.length<5)throw new Error('Vui lòng nhập đủ tên, điện thoại, email và địa chỉ giao hàng.');
    return{name,phone,email,province,ward,detail,note:String(input.note||'').slice(0,500)};
  }
  placeOrder(input){
    this.expirePendingPayments();
    const previous=input.idempotencyKey&&this.data.orders.find(o=>o.idempotencyKey===input.idempotencyKey&&o.owner===this.owner());
    if(previous)return previous;
    const lines=input.lines||this.selectedLines();
    if(!paymentMethods.includes(input.paymentMethod))throw new Error('Phương thức thanh toán không hợp lệ.');
    const address=this.validateAddress(input.address);
    const delivery=input.delivery==='STORE'?'STORE':'HOME';
    // Đơn đã được máy chủ (MySQL) chấp nhận: dùng mã đơn, giá và tổng tiền do máy chủ tính.
    const price=input.server?this.serverPrice(input.server):this.estimate(lines,input.couponCode,delivery,address.province);
    const now=input.server?.createdAt||new Date().toISOString(),id=input.server?.id||`NT-${Date.now()}-${uid().slice(0,6).toUpperCase()}`,online=input.paymentMethod!=='COD';
    const order={id,sync:input.server?{accessToken:input.accessToken}:null,owner:this.owner(),customer:clone(address),delivery,paymentMethod:input.paymentMethod,paymentStatus:online?'PENDING':'UNPAID',status:'PENDING_CONFIRMATION',items:price.items,subtotal:price.subtotal,discount:price.discount,shipping:price.shipping,total:price.total,coupon:price.coupon,createdAt:now,idempotencyKey:input.idempotencyKey||uid(),reservation:'RESERVED',history:[{status:'PENDING_CONFIRMATION',actor:'customer',time:now,note:'Đơn hàng demo được tạo'}],paymentAttempts:online?[{id:uid(),status:'PENDING',time:now}]:[],reference:input.paymentMethod==='BANK_DEMO'?id.replaceAll('-',''):null};
    for(const item of order.items)if(this.data.inventory[item.sku])this.data.inventory[item.sku].reserved+=item.qty;
    this.data.orders.unshift(order);
    if(!this.sessionStorage.getItem('nx_buy_now'))this.data.carts[this.owner()]=this.cart().filter(line=>!lines.some(item=>item.sku===line.sku));
    this.save();return order;
  }
  serverPrice(server){
    const items=server.items.map(item=>{const found=this.bySku(item.sku);return{sku:item.sku,productId:found?.product.id,name:item.name,variant:item.variant,unitPrice:item.unitPrice,qty:item.qty,imageIndex:found?.product.imageIndex??0};});
    return{items,subtotal:server.subtotal,discount:server.discount,shipping:server.shipping,total:server.total,coupon:server.coupon};
  }
  // Đồng bộ trạng thái đơn theo kết quả máy chủ sau mỗi thao tác.
  applyServerState(id,remote){
    const order=this.data.orders.find(o=>o.id===id);if(!order)return;
    if(remote.reservation==='RELEASED')this.release(order);
    if(remote.reservation==='CONSUMED')this.consume(order);
    if(order.status!==remote.status)order.history.push({status:remote.status,actor:'server',time:new Date().toISOString(),note:'Đồng bộ trạng thái từ máy chủ'});
    order.status=remote.status;order.paymentStatus=remote.paymentStatus;
    if(order.paymentAttempts?.length&&['PAID','FAILED'].includes(remote.paymentStatus))order.paymentAttempts.at(-1).status=remote.paymentStatus;
    this.save();
  }
  orders(){this.expirePendingPayments();return this.session?.role==='ADMIN_DEMO'?this.data.orders:this.data.orders.filter(o=>o.owner===this.owner());}
  order(id){const found=this.data.orders.find(o=>o.id===id);if(!found)throw new Error('Không tìm thấy đơn hàng.');this.requireCustomerOwner(found);return found;}
  audit(action,orderId,note=''){this.data.audit.unshift({id:uid(),action,orderId,actor:this.session?.email||this.session?.role||'guest',time:new Date().toISOString(),note});}
  release(order){
    if(order.reservation!=='RESERVED')return;
    for(const item of order.items)if(this.data.inventory[item.sku])this.data.inventory[item.sku].reserved-=item.qty;
    order.reservation='RELEASED';
  }
  consume(order){
    if(order.reservation!=='RESERVED')return;
    for(const item of order.items){const entry=this.data.inventory[item.sku];if(!entry)continue;entry.reserved-=item.qty;entry.onHand-=item.qty;}
    order.reservation='CONSUMED';
  }
  expirePendingPayments(now=Date.now()){
    let changed=false;
    for(const order of this.data.orders){
      const duration=order.paymentMethod==='BANK_DEMO'?24*60*60*1000:15*60*1000;
      if(order.paymentStatus!=='PENDING'||order.status==='CANCELLED'||order.paymentMethod==='COD'||now-new Date(order.createdAt).getTime()<duration)continue;
      order.paymentStatus='FAILED';order.status='CANCELLED';
      if(order.paymentAttempts?.length)order.paymentAttempts.at(-1).status='FAILED';
      this.release(order);
      order.history.push({status:'CANCELLED',actor:'demo-expiry',time:new Date(now).toISOString(),note:'Hết hạn thanh toán demo; tồn kho đã được giải phóng'});
      changed=true;
    }
    if(changed)this.save();
  }
  cancel(id){
    const order=this.order(id);
    if(!['PENDING_CONFIRMATION','CONFIRMED','PREPARING'].includes(order.status))throw new Error('Đơn đã giao cần yêu cầu hỗ trợ thay vì tự hủy.');
    order.status='CANCELLED';if(order.paymentStatus==='PAID')order.paymentStatus='REFUND_PENDING';
    this.release(order);order.history.push({status:'CANCELLED',actor:this.session?.email||'guest',time:new Date().toISOString()});
    this.audit('CANCEL',id);this.save();return order;
  }
  requestReturn(id){
    const order=this.order(id);
    if(!['DELIVERED','COMPLETED'].includes(order.status))throw new Error('Chỉ đơn đã giao mới có thể yêu cầu đổi trả.');
    order.status='RETURN_REQUESTED';order.history.push({status:'RETURN_REQUESTED',actor:this.session?.email||'guest',time:new Date().toISOString()});this.save();
  }
  transition(id,next){
    this.requireAdmin();const order=this.order(id);
    if(!canTransition(order,next))throw new Error('Chuyển trạng thái không hợp lệ hoặc thanh toán chưa xác minh.');
    if(next==='CANCELLED'){this.release(order);if(order.paymentStatus==='PAID')order.paymentStatus='REFUND_PENDING';}
    if(next==='SHIPPING')this.consume(order);
    order.status=next;order.history.push({status:next,actor:'admin-demo',time:new Date().toISOString()});
    this.audit('ORDER_STATUS',id,next);this.save();return order;
  }
  simulatePayment(id,result){
    const order=this.order(id);
    if(!['VNPAY_DEMO','MOMO_DEMO'].includes(order.paymentMethod)||order.paymentStatus!=='PENDING')throw new Error('Giao dịch demo không chờ thanh toán.');
    if(!['PAID','FAILED'].includes(result))throw new Error('Kết quả demo không hợp lệ.');
    order.paymentStatus=order.status==='CANCELLED'&&result==='PAID'?'REFUND_PENDING':result;
    order.paymentAttempts.at(-1).status=result;
    order.history.push({status:`PAYMENT_${result}`,actor:'simulator',time:new Date().toISOString(),note:'Kết quả giả lập, không phải giao dịch thật'});
    this.save();
  }
  retryPayment(id){
    const order=this.order(id);
    if(order.status==='CANCELLED')throw new Error('Đơn đã hủy không thể thanh toán lại.');
    if(!['VNPAY_DEMO','MOMO_DEMO'].includes(order.paymentMethod)||order.paymentStatus!=='FAILED')throw new Error('Đơn không thể thanh toán lại.');
    order.paymentStatus='PENDING';order.paymentAttempts.push({id:uid(),status:'PENDING',time:new Date().toISOString()});this.save();
  }
  verifyBankDemo(id){
    this.requireAdmin();const order=this.order(id);
    if(order.status==='CANCELLED')throw new Error('Đơn đã hủy cần đối soát và hoàn tiền nếu có giao dịch đến muộn.');
    if(order.paymentMethod!=='BANK_DEMO'||order.paymentStatus!=='PENDING')throw new Error('Đơn không chờ đối soát chuyển khoản.');
    order.paymentStatus='PAID';order.history.push({status:'PAYMENT_PAID',actor:'admin-demo',time:new Date().toISOString(),note:'Đối soát giả lập; không có chuyển khoản thật'});this.audit('BANK_VERIFY_DEMO',id);this.save();
  }
  markCodCollected(id){
    this.requireAdmin();const order=this.order(id);
    if(order.paymentMethod!=='COD'||!['DELIVERED','COMPLETED'].includes(order.status)||order.paymentStatus!=='UNPAID')throw new Error('Chỉ ghi nhận COD khi đơn đã giao.');
    order.paymentStatus='PAID';order.history.push({status:'PAYMENT_PAID',actor:'admin-demo',time:new Date().toISOString(),note:'Xác nhận thu COD giả lập'});this.audit('COD_COLLECTED_DEMO',id);this.save();
  }
  markRefundedDemo(id){
    this.requireAdmin();const order=this.order(id);
    if(order.paymentStatus!=='REFUND_PENDING')throw new Error('Đơn này không chờ hoàn tiền.');
    order.paymentStatus='REFUNDED';
    order.history.push({status:'PAYMENT_REFUNDED',actor:'admin-demo',time:new Date().toISOString(),note:'Hoàn tiền mô phỏng; không có giao dịch thật'});
    this.audit('REFUND_DEMO',id);this.save();
  }
  adjustStock(sku,value){this.requireAdmin();const entry=this.data.inventory[sku];if(!entry||!Number.isInteger(Number(value))||Number(value)<entry.reserved)throw new Error('Tồn kho không hợp lệ hoặc thấp hơn số đã giữ.');entry.onHand=Number(value);this.audit('STOCK_ADJUST',sku,String(value));this.save();}
  setProduct(sku,{price,active}){this.requireAdmin();const found=this.bySku(sku);if(!found)throw new Error('Không tìm thấy SKU.');if(price!==undefined){if(!Number.isSafeInteger(Number(price))||Number(price)<0)throw new Error('Giá không hợp lệ.');found.variant.price=Number(price);}if(active!==undefined)found.product.active=!!active;this.audit('PRODUCT_UPDATE',sku);this.save();}
  addProduct(input){this.requireAdmin();const name=String(input.name||'').trim(),price=Number(input.price),stock=Number(input.stock);if(name.length<3||!Number.isSafeInteger(price)||price<0||!Number.isInteger(stock)||stock<0)throw new Error('Dữ liệu sản phẩm không hợp lệ.');const id=Math.max(...this.data.products.map(p=>p.id))+1,sku=`NX-${String(id).padStart(3,'0')}-STD`,slug=`san-pham-${id}`;this.data.products.push({id,slug,name,brand:String(input.brand||'NEXTECH'),category:String(input.category||'Phụ kiện'),description:String(input.description||''),variants:[{sku,label:'Tiêu chuẩn',price,oldPrice:price,stock,color:'Đen'}],imageIndex:0,warranty:'Bảo hành 12 tháng',active:true});this.data.inventory[sku]={onHand:stock,reserved:0};this.audit('PRODUCT_CREATE',sku);this.save();}
  setCustomerLock(email,locked){this.requireAdmin();const user=this.data.users.find(u=>u.email===email);if(!user)throw new Error('Không tìm thấy khách hàng.');user.locked=!!locked;this.audit('CUSTOMER_LOCK',email,String(locked));this.save();}
  setCoupon(code,active){this.requireAdmin();const coupon=this.data.coupons.find(c=>c.code===code);if(!coupon)throw new Error('Không tìm thấy mã.');coupon.active=!!active;this.audit('COUPON_UPDATE',code,String(active));this.save();}
  metrics(){this.requireAdmin();const orders=this.data.orders;return{revenue:orders.filter(o=>o.paymentStatus==='PAID').reduce((sum,o)=>sum+o.total,0),newOrders:orders.filter(o=>o.status==='PENDING_CONFIRMATION').length,processing:orders.filter(o=>['CONFIRMED','PREPARING'].includes(o.status)).length,shipping:orders.filter(o=>o.status==='SHIPPING').length,completed:orders.filter(o=>o.status==='COMPLETED').length,cancelled:orders.filter(o=>o.status==='CANCELLED').length,customers:this.data.users.length};}
}
