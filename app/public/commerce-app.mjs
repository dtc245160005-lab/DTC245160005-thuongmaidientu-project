import {DemoCommerceService} from './commerce-service.mjs';
import {orderLabels,paymentLabels} from './commerce-data.mjs';
import {nextOrderStates} from './commerce-core.mjs';
import * as api from './commerce-api.mjs';

const shop=new DemoCommerceService();
let adminAuthorized=false;
const root=document.querySelector('#app');
const money=n=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(n||0);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=value=>new Date(value).toLocaleString('vi-VN');
const img=index=>`<div class="product-image" style="background-position:${index%4*100/3}% ${Math.floor(index/4)*50}%" aria-hidden="true"></div>`;
const btn=(label,action,extra='',classes='btn btn-primary')=>`<button type="button" class="${classes}" data-action="${action}" ${extra}>${label}</button>`;
const option=(value,label,selected)=>`<option value="${esc(value)}" ${selected?'selected':''}>${esc(label)}</option>`;
const input=(name,label,value='',type='text',required=true)=>`<label class="nx-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`;
const badge=(label,kind='blue')=>`<span class="nx-badge ${kind}">${esc(label)}</span>`;
const icon=name=>{
  const paths={
    search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6"/>',
    package:'<path d="M3 7 12 3l9 4v10l-9 4-9-4z"/><path d="m3 7 9 4 9-4M12 11v10"/>',
    cart:'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h2l2.4 12h13l2-9H5"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
  };
  return `<svg class="nx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
let filter='Tất cả',query='',couponCode='',checkoutKey=crypto.randomUUID(),checkoutToken=api.newAccessToken(),checkoutDelivery='HOME',checkoutPayment='COD';

function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3500);const inline=document.querySelector('#checkout-error');if(inline){inline.textContent=message;inline.hidden=false;}}
function go(path){
  if(['/login','/register'].includes(path)&&!['/login','/register'].includes(location.pathname)){
    const current=location.pathname+location.search+location.hash;
    if(isShoppingPath(current))sessionStorage.setItem('nx_auth_return',current);
    else sessionStorage.removeItem('nx_auth_return');
  }
  history.pushState({},'',path);window.scrollTo(0,0);render();
  const hash=path.split('#')[1];if(hash)document.getElementById(hash)?.scrollIntoView();
}
function isShoppingPath(path){return /^\/(?:cart|checkout|orders(?:\/[^/?#]+)?|products\/[^/?#]+)(?:[?#].*)?$/.test(path);}
function finishCustomerAuth(message){
  const saved=sessionStorage.getItem('nx_auth_return');
  sessionStorage.removeItem('nx_auth_return');
  sessionStorage.removeItem('nx_registration_success');
  go(saved&&isShoppingPath(saved)?saved:'/');
  toast(message);
}
function shell(content,active=''){
 const user=shop.session;
 return `<header class="site-header">
   <div class="utility"><div class="container utility-inner"><span>✦ NEXTECH · Công nghệ cho cuộc sống mới</span><span>Giao hàng toàn quốc · Bảo hành chính hãng</span></div></div>
   <div class="container main-header">
     <a class="logo" href="/" data-link aria-label="NEXTECH - Trang chủ"><span class="logo-icon">ϟ</span>NEX<span>TECH</span></a>
     <form class="header-search" id="search-form" role="search"><input name="query" placeholder="Tìm sản phẩm, thương hiệu..." value="${esc(query)}" aria-label="Tìm sản phẩm"><button aria-label="Tìm kiếm">${icon('search')}</button></form>
     <div class="header-actions">
       <a class="header-action" href="${user?.role==='CUSTOMER'?'/profile':'/login'}" data-link aria-label="${user?.role==='CUSTOMER'?'Hồ sơ':'Đăng nhập'}">${icon('user')}<span><small>Tài khoản</small><b>${esc(user?.name||'Đăng nhập')}</b></span></a>
       <a class="header-action" href="/orders" data-link aria-label="Đơn hàng">${icon('package')}<span><small>Theo dõi</small><b>Đơn hàng</b></span></a>
       <a class="header-action" href="/cart" data-link aria-label="Giỏ hàng, ${shop.cartCount()} sản phẩm">${icon('cart')}<span><small>Giỏ hàng</small><b>${shop.cartCount()} sản phẩm</b></span><em>${shop.cartCount()}</em></a>
       <button class="mobile-menu" data-action="menu" aria-label="Mở menu">${icon('menu')}</button>
     </div>
   </div>
   <div class="nav-wrap"><nav class="container nav" id="nav"><a href="/#products" data-link class="nav-category">${icon('grid')}<span>Danh mục sản phẩm</span></a><a href="/" data-link>Trang chủ</a><a href="/#products" data-link>Sản phẩm nổi bật</a><a href="/cart" data-link>Giỏ hàng</a><a href="/orders" data-link>Đơn hàng</a><a href="/admin" data-link>Quản trị demo</a></nav></div>
 </header>${content}<footer class="footer"><div class="container footer-grid"><div><a class="logo" href="/" data-link><span class="logo-icon">ϟ</span>NEX<span>TECH</span></a><p>Giao diện và giao dịch mô phỏng phục vụ học tập. Không thu tiền thật.</p></div><div><h4>Mua sắm</h4><a href="/" data-link>Sản phẩm</a><a href="/cart" data-link>Giỏ hàng</a><a href="/orders" data-link>Đơn hàng</a></div><div><h4>Tài khoản</h4><a href="/login" data-link>Đăng nhập</a><a href="/register" data-link>Đăng ký</a><a href="/profile" data-link>Địa chỉ</a></div><div><h4>Bản demo</h4><a href="/admin" data-link>Quản trị</a><p>Dữ liệu lưu trong trình duyệt hiện tại.</p></div></div><div class="container footer-bottom">© NEXTECH demo · ${active}</div></footer>`;
}
function title(text,sub=''){return `<div class="page-heading"><div><span class="eyebrow">NEXTECH</span><h1>${text}</h1><p>${sub}</p></div></div>`;}
function productCard(p){const v=p.variants[0],stock=shop.available(v.sku);return `<article class="product-card"><a href="/products/${p.slug}" data-link class="product-photo">${img(p.imageIndex)}<span class="sale-label">${v.oldPrice>v.price?'-'+Math.round((1-v.price/v.oldPrice)*100)+'%':'MỚI'}</span></a><div class="product-meta">${esc(p.brand)} · ${esc(p.category)} <span>★ 4.9</span></div><h3><a href="/products/${p.slug}" data-link>${esc(p.name)}</a></h3><p>${esc(v.label)} · Còn ${stock}</p><div class="prices"><strong>${money(v.price)}</strong><del>${money(v.oldPrice)}</del></div>${btn(stock?'Xem & chọn mua':'Hết hàng','product',`data-slug="${esc(p.slug)}" ${stock?'':'disabled'}`,'btn btn-primary add-btn')}</article>`;}
function home(){const categories=['Tất cả',...new Set(shop.products().map(p=>p.category))];const products=shop.products().filter(p=>(filter==='Tất cả'||p.category===filter)&&(!query||`${p.name} ${p.brand} ${p.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));return shell(`<main class="container home"><div class="hero-grid"><section class="hero-main"><div class="hero-copy"><span class="eyebrow light">✦ NEXTECH 2026</span><h1>Sức mạnh<br>Kiến tạo tương lai</h1><p>Khám phá thiết bị công nghệ phù hợp cho học tập, làm việc và giải trí.</p><div class="hero-buttons"><a href="#products" class="btn btn-primary">Mua ngay →</a><a href="/orders" data-link class="btn btn-outline-light">Theo dõi đơn</a></div><div class="hero-points"><span>✓ Hàng chính hãng</span><span>✓ Giao hàng toàn quốc</span></div></div></section><div class="hero-side"><div class="side-banner"><span class="eyebrow">Ưu đãi nổi bật</span><h2>iPhone và phụ kiện mới</h2><p>Chọn phiên bản hợp nhu cầu</p>${btn('Khám phá','product','data-slug="iphone-16-pro-max"')}${img(2)}</div><div class="side-banner watch"><span class="eyebrow">NEXTECH</span><h2>Công nghệ trên cổ tay</h2><p>Thiết bị chính hãng</p>${btn('Xem ngay','product','data-slug="apple-watch-series-10"')}${img(5)}</div></div></div><div class="benefits"><div>✓ <span><b>Giao hàng toàn quốc</b><small>Theo dõi từng bước</small></span></div><div>◈ <span><b>Sản phẩm chính hãng</b><small>Thông tin rõ ràng</small></span></div><div>♢ <span><b>Bảo hành chính hãng</b><small>Yên tâm mua sắm</small></span></div><div>☏ <span><b>Hỗ trợ 24/7</b><small>Luôn sẵn sàng</small></span></div></div><section class="section" id="products"><div class="section-title"><div><span class="eyebrow">Khám phá công nghệ</span><h2>Sản phẩm nổi bật</h2><p>Giá, phiên bản và tồn kho trong bản demo được cập nhật theo thao tác của bạn.</p></div><div class="filter-pills">${categories.map(c=>btn(esc(c),'filter',`data-filter="${esc(c)}"`,`nx-filter ${filter===c?'active':''}`)).join('')}</div></div><div class="product-grid">${products.length?products.map(productCard).join(''):'<div class="nx-empty">Không tìm thấy sản phẩm phù hợp.</div>'}</div></section></main>`,'Trang chủ');}
function productPage(slug){const p=shop.product(slug);if(!p)return shell(`<main class="container inner-page">${title('Không tìm thấy sản phẩm')}<a href="/" data-link class="btn btn-primary">Về trang chủ</a></main>`);const v=p.variants[0];return shell(`<main class="container inner-page"><div class="breadcrumb"><a href="/" data-link>Trang chủ</a> › ${esc(p.category)} › ${esc(p.name)}</div>${title(esc(p.name),`${esc(p.brand)} · ${esc(p.warranty)}`)}<div class="nx-detail"><div class="nx-detail-photo">${img(p.imageIndex)}</div><div class="nx-panel"><span class="eyebrow">${esc(p.category)} · ${esc(p.brand)}</span><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p><div class="nx-price" id="detail-price">${money(v.price)}</div><p>Chọn phiên bản:</p><div class="nx-variants">${p.variants.map((item,i)=>btn(`${esc(item.label)} · ${money(item.price)}`,'variant',`data-sku="${esc(item.sku)}"`,`nx-variant ${i===0?'active':''}`)).join('')}</div><p id="detail-stock">Còn ${shop.available(v.sku)} sản phẩm · SKU ${esc(v.sku)}</p><label class="nx-field nx-qty"><span>Số lượng</span><input id="detail-qty" type="number" min="1" max="99" value="1"></label><div class="nx-actions">${btn('Thêm vào giỏ','add-detail')}${btn('Mua ngay','buy-detail','','btn btn-outline')}</div><p>✓ Bảo hành chính hãng &nbsp; ✓ Kiểm tra tồn kho trước khi đặt</p></div></div><section class="section"><h2>Có thể bạn quan tâm</h2><div class="product-grid">${shop.products().filter(x=>x.id!==p.id).slice(0,4).map(productCard).join('')}</div></section></main>`,'Chi tiết sản phẩm');}
function summary(price,checkout=false){return `<aside class="summary nx-panel"><h2>Đơn hàng của bạn</h2><div class="nx-summary-line"><span>Tạm tính</span><b>${money(price?.subtotal)}</b></div><div class="nx-summary-line"><span>Giảm giá ${price?.coupon?'('+price.coupon+')':''}</span><b>-${money(price?.discount)}</b></div><div class="nx-summary-line"><span>Phí giao hàng</span><b>${money(price?.shipping)}</b></div><div class="nx-summary-line nx-grand"><span>Tổng thanh toán</span><strong>${money(price?.total)}</strong></div>${!checkout?btn('Tiến hành thanh toán →','checkout',`class="btn btn-primary nx-wide"`,'btn btn-primary nx-wide'):''}<small>Đây là giao dịch mô phỏng, không thanh toán thật.</small></aside>`;}
function cart(){const lines=shop.cart(),selected=shop.selectedLines();let price=null,error='';try{if(selected.length)price=shop.estimate(selected,couponCode);}catch(e){error=e.message;}return shell(`<main class="container inner-page">${title('Giỏ hàng',`${lines.length} phiên bản trong giỏ`)}<div class="cart-layout"><div class="cart-list"><div class="cart-toolbar"><label><input type="checkbox" id="select-all" ${lines.length&&lines.every(x=>x.selected)?'checked':''}> Chọn tất cả</label>${btn('Xóa sản phẩm đã chọn','remove-selected','','btn btn-outline')}</div>${lines.length?lines.map(line=>{const found=shop.bySku(line.sku);if(!found)return '';return `<div class="nx-cart-item"><input type="checkbox" class="line-select" data-sku="${esc(line.sku)}" ${line.selected?'checked':''}>${img(found.product.imageIndex)}<div class="cart-info"><small>${esc(found.product.brand)} · ${esc(line.sku)}</small><h3><a href="/products/${found.product.slug}" data-link>${esc(found.product.name)}</a></h3><p>${esc(found.variant.label)} · Còn ${shop.available(line.sku)}</p><strong>${money(found.variant.price)}</strong></div><div class="nx-quantity">${btn('−','qty',`data-sku="${esc(line.sku)}" data-delta="-1"`,'nx-icon-btn')}<b>${line.qty}</b>${btn('+','qty',`data-sku="${esc(line.sku)}" data-delta="1"`,'nx-icon-btn')}</div>${btn('×','remove',`data-sku="${esc(line.sku)}"`,'nx-icon-btn')}</div>`;}).join(''):'<div class="nx-empty">Giỏ hàng đang trống. <a href="/" data-link>Khám phá sản phẩm →</a></div>'}<form id="coupon-form" class="nx-coupon"><label>Mã ưu đãi <input name="code" value="${esc(couponCode)}" placeholder="Thử NEX10"></label><button class="btn btn-outline">Áp dụng</button></form>${error?`<p class="nx-error">${esc(error)}</p>`:''}</div>${summary(price)}</div></main>`,'Giỏ hàng');}
function checkout(){let lines=shop.selectedLines();const buy=JSON.parse(sessionStorage.getItem('nx_buy_now')||'null');if(buy)lines=[buy];if(!lines.length)return shell(`<main class="container inner-page">${title('Chưa có sản phẩm để thanh toán')}<a href="/cart" data-link class="btn btn-primary">Về giỏ hàng</a></main>`);let price,error='';try{price=shop.estimate(lines,couponCode,checkoutDelivery);}catch(e){error=e.message;}const profile=shop.profile(),address=profile?.addresses?.[0]||{};return shell(`<main class="container inner-page">${title('Thanh toán','Kiểm tra sản phẩm, địa chỉ và phương thức thanh toán trước khi đặt đơn.')}<div class="cart-layout"><form id="checkout-form" class="nx-panel nx-form"><h2>Thông tin nhận hàng</h2><div class="nx-form-grid">${input('name','Họ và tên',address.name||profile?.name)}${input('phone','Số điện thoại',address.phone||profile?.phone,'tel')}${input('email','Email',address.email||profile?.email,'email')}${input('province','Tỉnh / thành phố',address.province)}${input('ward','Phường / xã',address.ward)}${input('detail','Số nhà, đường',address.detail)}</div>${input('note','Ghi chú',address.note,'text',false)}<h2>Giao hàng</h2><label class="nx-radio"><input name="delivery" type="radio" value="HOME" ${checkoutDelivery==='HOME'?'checked':''}> Giao tận nơi</label><label class="nx-radio"><input name="delivery" type="radio" value="STORE" ${checkoutDelivery==='STORE'?'checked':''}> Nhận tại cửa hàng demo</label><h2>Thanh toán</h2>${[['COD','Thanh toán khi nhận hàng'],['BANK_DEMO','Chuyển khoản mô phỏng'],['VNPAY_DEMO','VNPAY mô phỏng'],['MOMO_DEMO','MoMo mô phỏng']].map(([value,label],i)=>`<label class="nx-radio"><input name="paymentMethod" type="radio" value="${value}" ${i===0?'checked':''}> ${label}</label>`).join('')}<p class="nx-hint">Chuyển khoản và ví điện tử ở đây chỉ là giả lập. Không nhập tài khoản ngân hàng thật.</p><button class="btn btn-primary nx-wide" ${price?'':'disabled'}>Đặt hàng · ${money(price?.total)}</button>${error?`<p class="nx-error">${esc(error)}</p>`:''}</form><aside>${summary(price,true)}<div class="nx-panel nx-order-items"><h3>${price?.items.length||0} sản phẩm</h3>${(price?.items||[]).map(item=>`<div>${img(item.imageIndex)}<span><b>${esc(item.name)}</b><small>${esc(item.variant)} · ${item.qty}</small></span><strong>${money(item.unitPrice*item.qty)}</strong></div>`).join('')}</div></aside></div></main>`,'Thanh toán');}
function orders(){const list=shop.orders();return shell(`<main class="container inner-page">${title('Đơn hàng của tôi',`${list.length} đơn trong trình duyệt này`)}<div class="nx-order-list">${list.length?list.map(o=>`<article class="order-card nx-order-card"><div><b>${esc(o.id)}</b> · ${stamp(o.createdAt)} ${badge(orderLabels[o.status]||o.status)} ${badge(paymentLabels[o.paymentStatus]||o.paymentStatus,'orange')}</div><div class="nx-order-item">${img(o.items[0].imageIndex)}<span><b>${esc(o.items[0].name)}</b><small>${o.items.length} dòng sản phẩm · ${esc(paymentLabels[o.paymentMethod]||o.paymentMethod)}</small></span><strong>${money(o.total)}</strong></div><a class="btn btn-outline" href="/orders/${encodeURIComponent(o.id)}" data-link>Xem chi tiết →</a></article>`).join(''):'<div class="nx-empty">Chưa có đơn hàng. <a href="/" data-link>Mua sắm ngay →</a></div>'}</div></main>`,'Đơn hàng');}
function orderPage(id){let o;try{o=shop.order(id);}catch(e){return shell(`<main class="container inner-page">${title('Không thể xem đơn hàng',esc(e.message))}</main>`);}const actions=[];if(['PENDING_CONFIRMATION','CONFIRMED','PREPARING'].includes(o.status))actions.push(btn('Hủy đơn','cancel',`data-id="${esc(id)}"`,'btn btn-outline'));if(['DELIVERED','COMPLETED'].includes(o.status))actions.push(btn('Yêu cầu đổi trả','return',`data-id="${esc(id)}"`,'btn btn-outline'));if(['VNPAY_DEMO','MOMO_DEMO'].includes(o.paymentMethod)&&o.paymentStatus==='PENDING')actions.push(btn('Giả lập thanh toán thành công','pay-success',`data-id="${esc(id)}"`),btn('Giả lập thất bại','pay-fail',`data-id="${esc(id)}"`,'btn btn-outline'));if(o.paymentStatus==='FAILED')actions.push(btn('Thử thanh toán lại','retry',`data-id="${esc(id)}"`));return shell(`<main class="container inner-page"><div class="breadcrumb"><a href="/orders" data-link>Đơn hàng</a> › ${esc(id)}</div>${title(`Đơn hàng ${esc(id)}`,stamp(o.createdAt))}<div class="cart-layout"><div class="nx-stack"><section class="nx-panel"><h2>Trạng thái ${badge(orderLabels[o.status]||o.status)}</h2><div class="nx-timeline">${o.history.map(h=>`<div><b>${esc(orderLabels[h.status]||paymentLabels[h.status]||h.status)}</b><small>${stamp(h.time)} · ${esc(h.actor)}</small></div>`).join('')}</div><div class="nx-actions">${actions.join('')}</div></section><section class="nx-panel"><h2>Sản phẩm</h2>${o.items.map(item=>`<div class="nx-order-item">${img(item.imageIndex)}<span><b>${esc(item.name)}</b><small>${esc(item.variant)} · SKU ${esc(item.sku)} · SL ${item.qty}</small></span><strong>${money(item.unitPrice*item.qty)}</strong></div>`).join('')}</section></div><aside class="nx-stack"><section class="nx-panel"><h2>Người nhận</h2><p><b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}</p><p>${esc(o.customer.detail)}, ${esc(o.customer.ward)}, ${esc(o.customer.province)}</p><p>${esc(o.customer.email)}</p></section><section class="nx-panel"><h2>Thanh toán</h2><p>${esc(paymentLabels[o.paymentMethod]||o.paymentMethod)} · ${esc(paymentLabels[o.paymentStatus]||o.paymentStatus)}</p>${o.reference?`<p>Mã tham chiếu demo: <b>${esc(o.reference)}</b></p>`:''}<div class="nx-summary-line"><span>Tạm tính</span><b>${money(o.subtotal)}</b></div><div class="nx-summary-line"><span>Giảm giá</span><b>-${money(o.discount)}</b></div><div class="nx-summary-line"><span>Phí giao</span><b>${money(o.shipping)}</b></div><div class="nx-summary-line nx-grand"><span>Tổng cộng</span><strong>${money(o.total)}</strong></div></section></aside></div></main>`,'Chi tiết đơn');}
function auth(register=false){const registeredEmail=register?'':sessionStorage.getItem('nx_registration_success')||'';return shell(`<main class="container inner-page nx-auth">${title(register?'Tạo tài khoản':'Chào mừng trở lại',register?'Lưu đơn hàng và địa chỉ trong bản demo.':'Đăng nhập để lưu đơn hàng theo tài khoản demo.')}<form id="${register?'register':'login'}-form" class="nx-panel nx-form">${registeredEmail?'<p class="nx-success" role="status">Đăng ký thành công! Vui lòng đăng nhập để tiếp tục.</p>':''}${register?input('name','Họ và tên')+input('phone','Số điện thoại','','tel'):''}${input('email','Email',registeredEmail,'email')}${input('password','Mật khẩu','','password')}<button class="btn btn-primary nx-wide">${register?'Đăng ký':'Đăng nhập'}</button><p>${register?'Đã có tài khoản? <a href="/login" data-link>Đăng nhập</a>':'Chưa có tài khoản? <a href="/register" data-link>Đăng ký</a>'}</p>${!register?`<div class="demo-account"><b>Tài khoản khách demo</b><span>demo@nextech.vn / Nextech@2026</span><small>Mật khẩu này chỉ dùng cho bản demo chạy trong trình duyệt.</small></div><a class="btn btn-outline nx-wide" href="/admin/login" data-link>Đăng nhập quản trị</a>`:''}</form></main>`,'Tài khoản');}
function adminLogin(){return shell(`<main class="container inner-page nx-auth">${title('Đăng nhập quản trị','Nhập tài khoản quản trị được cấu hình trên máy chủ.')}<form id="admin-login-form" class="nx-panel nx-form">${input('email','Email quản trị','','email')}${input('password','Mật khẩu','','password')}<button class="btn btn-primary nx-wide">Đăng nhập quản trị</button><p id="admin-login-error" class="nx-checkout-error" role="alert" hidden></p><p class="nx-hint">Tài khoản khách hàng không thể đăng nhập vào trang quản trị. Đơn hàng được lưu trên máy chủ MySQL; sản phẩm, khách hàng và khuyến mãi vẫn là dữ liệu demo trong trình duyệt.</p><a href="/login" data-link class="text-link">← Đăng nhập khách hàng</a></form></main>`,'Đăng nhập quản trị');}
function profile(){const p=shop.profile();if(!p)return shell(`<main class="container inner-page">${title('Tài khoản của bạn','Đăng nhập để lưu hồ sơ và địa chỉ.')}<a href="/login" data-link class="btn btn-primary">Đăng nhập</a></main>`);return shell(`<main class="container inner-page">${title('Hồ sơ của tôi',esc(p.email))}<div class="cart-layout"><form id="profile-form" class="nx-panel nx-form"><h2>Thông tin cá nhân</h2>${input('name','Họ và tên',p.name)}${input('phone','Số điện thoại',p.phone,'tel')}<button class="btn btn-primary">Lưu hồ sơ</button>${btn('Đăng xuất','logout','','btn btn-outline')}</form><section class="nx-panel"><h2>Địa chỉ đã lưu</h2>${(p.addresses||[]).map(a=>`<p>${esc(a.name)} · ${esc(a.phone)}<br>${esc(a.detail)}, ${esc(a.ward)}, ${esc(a.province)}</p>`).join('')||'<p>Chưa có địa chỉ.</p>'}<form id="address-form" class="nx-form"><h3>Thêm địa chỉ</h3><div class="nx-form-grid">${input('name','Người nhận',p.name)}${input('phone','Điện thoại',p.phone,'tel')}${input('email','Email',p.email,'email')}${input('province','Tỉnh / thành phố')}${input('ward','Phường / xã')}${input('detail','Số nhà, đường')}</div><button class="btn btn-primary">Lưu địa chỉ</button></form></section></div></main>`,'Hồ sơ');}
function admin(){if(shop.session?.role!=='ADMIN_DEMO')return shell(`<main class="container inner-page">${title('Quản trị demo','Chế độ này chỉ mô phỏng quyền quản trị trong trình duyệt.')}<a href="/login" data-link class="btn btn-primary">Vào trang đăng nhập</a></main>`);const tab=new URLSearchParams(location.search).get('view')||'overview',m=shop.metrics(),tabs=[['overview','Tổng quan'],['orders','Đơn hàng'],['products','Sản phẩm & tồn kho'],['customers','Khách hàng'],['promotions','Khuyến mãi']];let body='';if(tab==='overview')body=`<div class="kpis">${[['Doanh thu đã thu',money(m.revenue)],['Chờ xác nhận',m.newOrders],['Đang xử lý',m.processing],['Đang giao',m.shipping],['Hoàn thành',m.completed],['Khách hàng',m.customers]].map(([a,b])=>`<div class="kpi"><small>${a}</small><strong>${b}</strong></div>`).join('')}</div><section class="nx-panel"><h2>Đơn hàng gần đây</h2>${adminOrders(shop.orders().slice(0,5))}</section>`;else if(tab==='orders')body=`<section class="nx-panel"><h2>Quản lý đơn hàng</h2>${adminOrders(shop.orders())}</section>`;else if(tab==='products')body=`<section class="nx-panel"><h2>Sản phẩm & biến thể</h2><div class="table-scroll"><table><thead><tr><th>Sản phẩm</th><th>SKU</th><th>Giá</th><th>Tồn / giữ</th><th>Thao tác</th></tr></thead><tbody>${shop.allProducts().flatMap(p=>p.variants.map(v=>`<tr><td>${esc(p.name)} ${p.active?'':'(Ẩn)'}</td><td>${esc(v.sku)}</td><td>${money(v.price)}</td><td>${shop.data.inventory[v.sku].onHand} / ${shop.data.inventory[v.sku].reserved}</td><td>${btn('Sửa giá / kho','edit-sku',`data-sku="${esc(v.sku)}"`,'btn btn-outline')}</td></tr>`)).join('')}</tbody></table></div><form id="new-product-form" class="nx-form"><h3>Thêm sản phẩm demo</h3><div class="nx-form-grid">${input('name','Tên sản phẩm')}${input('brand','Thương hiệu')}${input('category','Danh mục')}${input('price','Giá','','number')}${input('stock','Số lượng','','number')}</div><button class="btn btn-primary">Thêm sản phẩm</button></form></section>`;else if(tab==='customers')body=`<section class="nx-panel"><h2>Khách hàng đã đăng ký</h2>${shop.data.users.length?shop.data.users.map(u=>`<div class="nx-admin-row"><span><b>${esc(u.name)}</b><small>${esc(u.email)} · ${esc(u.phone)}</small></span>${btn(u.locked?'Mở khóa':'Khóa','lock-user',`data-email="${esc(u.email)}" data-locked="${u.locked?'false':'true'}"`,'btn btn-outline')}</div>`).join(''):'<p>Chưa có khách hàng đăng ký thêm.</p>'}</section>`;else body=`<section class="nx-panel"><h2>Mã khuyến mãi</h2>${shop.data.coupons.map(c=>`<div class="nx-admin-row"><span><b>${esc(c.code)}</b><small>Giảm ${c.value}% · ${c.active?'Đang bật':'Đã tắt'}</small></span>${btn(c.active?'Tắt':'Bật','coupon-toggle',`data-code="${esc(c.code)}" data-active="${c.active?'false':'true'}"`,'btn btn-outline')}</div>`).join('')}</section>`;return `<div class="admin-shell"><aside class="sidebar"><a class="logo" href="/" data-link><span class="logo-icon">ϟ</span>NEX<span>TECH</span></a><small>QUẢN TRỊ DEMO</small><nav>${tabs.map(([id,label])=>`<a class="${tab===id?'active':''}" href="/admin?view=${id}" data-link>${label}</a>`).join('')}</nav><div class="sidebar-note"><b>Chế độ mô phỏng</b><p>Dữ liệu chỉ trong trình duyệt. Không cấp quyền máy chủ.</p></div><a href="/" data-link>Xem cửa hàng →</a>${btn('Thoát quản trị','logout','','btn btn-outline')}</aside><div class="admin-main"><div class="admin-top"><b>NEXTECH · Quản trị demo</b><span>Không phải quyền quản trị máy chủ</span></div><main class="admin-content"><div class="admin-heading"><div><span>Xin chào, Quản trị viên 👋</span><h1>${tabs.find(x=>x[0]===tab)?.[1]||'Tổng quan'}</h1><p>Dữ liệu tính từ giao dịch mô phỏng hiện tại.</p></div></div>${body}</main></div></div>`;}
function adminOrders(list){return list.length?`<div class="table-scroll"><table><thead><tr><th>Mã</th><th>Khách hàng</th><th>Tổng</th><th>Trạng thái</th><th>Thanh toán</th><th>Thao tác</th></tr></thead><tbody>${list.map(o=>`<tr><td><a href="/orders/${encodeURIComponent(o.id)}" data-link>${esc(o.id)}</a></td><td>${esc(o.customer.name)}</td><td>${money(o.total)}</td><td>${esc(orderLabels[o.status]||o.status)}</td><td>${esc(paymentLabels[o.paymentStatus]||o.paymentStatus)}</td><td><select class="admin-order-state" data-id="${esc(o.id)}">${option('', 'Chuyển trạng thái',true)}${(nextOrderStates[o.status]||[]).map(s=>option(s,orderLabels[s])).join('')}</select>${o.paymentMethod==='BANK_DEMO'&&o.paymentStatus==='PENDING'?btn('Xác nhận CK demo','bank-verify',`data-id="${esc(o.id)}"`,'btn btn-outline'):''}${o.paymentMethod==='COD'&&o.paymentStatus==='UNPAID'&&['DELIVERED','COMPLETED'].includes(o.status)?btn('Đã thu COD','cod-collected',`data-id="${esc(o.id)}"`,'btn btn-outline'):''}</td></tr>`).join('')}</tbody></table></div>`:'<p>Chưa có đơn hàng.</p>';}
function paymentDemoPage(id){
  let order;try{order=shop.order(id);}catch(error){return shell(`<main class="container inner-page">${title('Không tìm thấy giao dịch',esc(error.message))}<a class="btn btn-primary" href="/orders" data-link>Đơn hàng của tôi</a></main>`);}
  if(!['VNPAY_DEMO','MOMO_DEMO'].includes(order.paymentMethod))return orderPage(id);
  const method=order.paymentMethod==='VNPAY_DEMO'?'VNPAY':'MoMo';
  const pending=order.paymentStatus==='PENDING',failed=order.paymentStatus==='FAILED',paid=order.paymentStatus==='PAID';
  return shell(`<main class="container inner-page nx-payment-page"><div class="breadcrumb"><a href="/orders/${encodeURIComponent(id)}" data-link>Đơn hàng ${esc(id)}</a> › Thanh toán demo</div>${title(`${method} · Thanh toán demo`,'Bước mô phỏng để kiểm tra luồng đơn hàng; không có giao dịch tiền thật.')}<section class="nx-panel nx-payment-card"><span class="nx-demo-tag">MÔ PHỎNG · KHÔNG THU TIỀN</span><div class="nx-payment-mark">${paid?'✓':failed?'!':'↗'}</div><h2>${pending?'Chọn kết quả giao dịch thử':paid?'Thanh toán demo thành công':failed?'Thanh toán demo thất bại':'Giao dịch đã kết thúc'}</h2><p>Đơn hàng <b>${esc(id)}</b> · ${method}</p><div class="nx-payment-amount">${money(order.total)}</div><p class="nx-payment-note">Đây là trình mô phỏng. Không nhập thông tin thẻ, tài khoản ngân hàng, mã OTP hoặc chuyển tiền.</p><div class="nx-actions nx-payment-actions">${pending?btn('Giả lập thành công','pay-success',`data-id="${esc(id)}"`)+btn('Giả lập thất bại','pay-fail',`data-id="${esc(id)}"`,'btn btn-outline'):failed?btn('Thử lại bản demo','retry',`data-id="${esc(id)}"`):''}<a class="btn btn-outline" href="/orders/${encodeURIComponent(id)}" data-link>Xem chi tiết đơn</a></div></section></main>`,'Thanh toán demo');
}
function render(){const path=decodeURIComponent(location.pathname);if(path==='/admin'&&!adminAuthorized){history.replaceState({},'','/admin/login');root.innerHTML=adminLogin();}else if(path==='/admin')root.innerHTML=admin();else if(path==='/admin/login')root.innerHTML=adminLogin();else if(path==='/cart')root.innerHTML=cart();else if(path==='/checkout')root.innerHTML=checkout();else if(path==='/orders')root.innerHTML=orders();else if(path.startsWith('/payment-demo/'))root.innerHTML=paymentDemoPage(path.slice(14));else if(path.startsWith('/orders/'))root.innerHTML=orderPage(path.slice(8));else if(path.startsWith('/products/'))root.innerHTML=productPage(path.slice(10));else if(path==='/login')root.innerHTML=auth();else if(path==='/register')root.innerHTML=auth(true);else if(path==='/profile')root.innerHTML=profile();else root.innerHTML=home();document.title=`NEXTECH · ${path==='/'?'Trang chủ':path.split('/')[1]}`;}
const formData=form=>Object.fromEntries(new FormData(form).entries());
document.addEventListener('click',async event=>{const link=event.target.closest('a[data-link]');if(link){event.preventDefault();go(link.getAttribute('href'));return;}const target=event.target.closest('[data-action]');if(!target)return;const a=target.dataset.action;try{if(a==='menu'){document.querySelector('#nav')?.classList.toggle('open');return;}if(a==='product'){go(`/products/${target.dataset.slug}`);return;}if(a==='filter'){filter=target.dataset.filter;render();document.querySelector('#products')?.scrollIntoView();return;}if(a==='variant'){document.querySelectorAll('.nx-variant').forEach(x=>x.classList.remove('active'));target.classList.add('active');const found=shop.bySku(target.dataset.sku);document.querySelector('#detail-price').textContent=money(found.variant.price);document.querySelector('#detail-stock').textContent=`Còn ${shop.available(target.dataset.sku)} sản phẩm · SKU ${target.dataset.sku}`;return;}if(['add-detail','buy-detail'].includes(a)){const sku=document.querySelector('.nx-variant.active')?.dataset.sku,qty=Number(document.querySelector('#detail-qty').value);if(a==='buy-detail'){shop.estimate([{sku,qty}]);sessionStorage.setItem('nx_buy_now',JSON.stringify({sku,qty}));checkoutKey=crypto.randomUUID();go('/checkout');}else{shop.addCart(sku,qty);toast('Đã thêm vào giỏ hàng');render();}return;}if(a==='qty'){const line=shop.cart().find(x=>x.sku===target.dataset.sku);shop.changeQty(line.sku,line.qty+Number(target.dataset.delta));render();return;}if(a==='remove'){shop.removeCart(target.dataset.sku);render();return;}if(a==='remove-selected'){for(const line of [...shop.selectedLines()])shop.removeCart(line.sku);render();return;}if(a==='checkout'){if(!shop.selectedLines().length)throw new Error('Vui lòng chọn sản phẩm.');sessionStorage.removeItem('nx_buy_now');checkoutKey=crypto.randomUUID();go('/checkout');return;}if(a==='cancel'){await orderAction(target.dataset.id,'cancel',{},false,()=>shop.cancel(target.dataset.id));render();return;}if(a==='return'){await orderAction(target.dataset.id,'return',{},false,()=>shop.requestReturn(target.dataset.id));render();return;}if(a==='pay-success'||a==='pay-fail'){const result=a==='pay-success'?'PAID':'FAILED';await orderAction(target.dataset.id,'payment',{result},false,()=>shop.simulatePayment(target.dataset.id,result));render();return;}if(a==='retry'){await orderAction(target.dataset.id,'retry-payment',{},false,()=>shop.retryPayment(target.dataset.id));render();return;}if(a==='logout'){shop.logout();go('/');return;}if(a==='bank-verify'){await orderAction(target.dataset.id,'bank-verify',{},true,()=>shop.verifyBankDemo(target.dataset.id));render();return;}if(a==='cod-collected'){await orderAction(target.dataset.id,'cod-collected',{},true,()=>shop.markCodCollected(target.dataset.id));render();return;}if(a==='edit-sku'){const found=shop.bySku(target.dataset.sku),entry=shop.data.inventory[target.dataset.sku];const price=prompt('Giá mới (VND)',found.variant.price);if(price===null)return;const stock=prompt('Tồn kho vật lý',entry.onHand);if(stock===null)return;shop.setProduct(target.dataset.sku,{price});shop.adjustStock(target.dataset.sku,stock);render();return;}if(a==='lock-user'){shop.setCustomerLock(target.dataset.email,target.dataset.locked==='true');render();return;}if(a==='coupon-toggle'){shop.setCoupon(target.dataset.code,target.dataset.active==='true');render();return;}}catch(e){toast(e.message);}});
document.addEventListener('change',async event=>{const t=event.target;try{if(t.id==='select-all'){shop.selectAll(t.checked);render();}else if(t.classList.contains('line-select')){shop.selectCart(t.dataset.sku,t.checked);render();}else if(t.name==='delivery'){checkoutDelivery=t.value;render();}else if(t.classList.contains('admin-order-state')&&t.value){const next=t.value;await orderAction(t.dataset.id,'status',{status:next},true,()=>shop.transition(t.dataset.id,next));render();}}catch(e){toast(e.message);}});
document.addEventListener('submit',async event=>{
  const form=event.target;event.preventDefault();const data=formData(form);
  try{
    if(form.id==='search-form'){query=String(data.query||'').trim();filter='Tất cả';go('/#products');return;}
    if(form.id==='coupon-form'){couponCode=String(data.code||'').trim().toUpperCase();shop.estimate(shop.selectedLines(),couponCode);render();toast('Đã áp dụng mã ưu đãi');return;}
    if(form.id==='checkout-form'){
      const button=form.querySelector('button[type=submit],button:not([type])');button.disabled=true;
      const buy=JSON.parse(sessionStorage.getItem('nx_buy_now')||'null');
      const lines=buy?[buy]:shop.selectedLines();
      // Máy chủ tính giá, giữ tồn kho và lưu đơn vào MySQL trước; chỉ khi chạy local không có MySQL mới lưu tạm trong trình duyệt.
      let server=null,offline=false;
      try{server=await api.createOrder({idempotencyKey:checkoutKey,accessToken:checkoutToken,items:lines.map(line=>({sku:line.sku,qty:line.qty})),couponCode,delivery:data.delivery,paymentMethod:data.paymentMethod,address:data});}
      catch(error){if(!error.offlineDemo)throw error;offline=true;}
      const order=shop.placeOrder({lines,address:data,paymentMethod:data.paymentMethod,delivery:data.delivery,couponCode,idempotencyKey:checkoutKey,server,accessToken:checkoutToken});
      sessionStorage.removeItem('nx_buy_now');checkoutKey=crypto.randomUUID();checkoutToken=api.newAccessToken();checkoutDraft=null;checkoutPayment='COD';
      if(offline)setTimeout(()=>toast('Máy chủ chưa kết nối MySQL: đơn chỉ được lưu tạm trong trình duyệt này.'),1600);
      if(['VNPAY_DEMO','MOMO_DEMO'].includes(order.paymentMethod)){
        go(`/payment-demo/${order.id}`);
        toast('Đã tạo đơn. Hãy chọn kết quả thanh toán mô phỏng.');
      }else{
        go(`/orders/${order.id}`);
        toast(order.paymentMethod==='COD'?'Đơn COD đã tạo. Bạn thanh toán khi nhận hàng.':'Đơn chuyển khoản demo đang chờ quản trị xác nhận.');
      }
      return;
    }
    if(form.id==='login-form'){await revokeAdminSession();await shop.login(data.email,data.password);finishCustomerAuth('Đăng nhập thành công');return;}
    if(form.id==='register-form'){await revokeAdminSession();const account=await shop.register(data);sessionStorage.setItem('nx_registration_success',account.email);go('/login');toast('Đăng ký thành công. Vui lòng đăng nhập.');return;}
    if(form.id==='profile-form'){shop.saveProfile(data);render();toast('Đã lưu hồ sơ');return;}
    if(form.id==='address-form'){shop.saveAddress(data);render();toast('Đã lưu địa chỉ');return;}
    if(form.id==='new-product-form'){shop.addProduct(data);render();toast('Đã thêm sản phẩm demo');return;}
  }catch(error){
    toast(error.message);
    if(form.id==='checkout-form')document.querySelector('#checkout-error')?.scrollIntoView({block:'center',behavior:'smooth'});
    const button=form.querySelector('button[type=submit],button:not([type])');if(button)button.disabled=false;
  }
});
window.addEventListener('popstate',()=>render());
const baseRender=render;
let checkoutDraft=null;
render=function(){
  baseRender();
  const path=location.pathname;
  if(path==='/checkout'){
    const form=document.querySelector('#checkout-form'),profile=shop.profile();
    if(form){
      if(profile?.addresses?.length){
        const select=document.createElement('select');select.id='saved-address';select.className='nx-select';
        select.innerHTML='<option value="">Chọn địa chỉ đã lưu</option>'+profile.addresses.map((a,i)=>`<option value="${i}">${esc(a.name)} · ${esc(a.detail)}, ${esc(a.ward)}</option>`).join('');
        form.insertBefore(select,form.querySelector('.nx-form-grid'));
      }
      if(checkoutDraft){for(const [name,value] of Object.entries(checkoutDraft)){const field=form.elements[name];if(field&&field.type!=='radio')field.value=value;}}
      const method=form.querySelector(`input[name="paymentMethod"][value="${checkoutPayment}"]`);if(method)method.checked=true;
      const submit=form.querySelector('button:not([type])');
      const guide=document.createElement('div');guide.id='payment-guide';guide.className='nx-payment-guide';submit.before(guide);
      const error=document.createElement('p');error.id='checkout-error';error.className='nx-checkout-error';error.setAttribute('role','alert');error.hidden=true;submit.after(error);
      const help=document.createElement('p');help.className='nx-checkout-help';help.textContent='Điền số điện thoại 10–11 chữ số và địa chỉ chi tiết ít nhất 5 ký tự.';error.after(help);
      updateCheckoutTotals();updateCheckoutMethod();
    }
  }
  if(path==='/orders'){
    const list=document.querySelector('.nx-order-list'),orders=shop.orders();
    if(list&&orders.length){
      const controls=document.createElement('div');controls.className='nx-order-controls';
      controls.innerHTML=`<input id="order-search" placeholder="Tìm mã đơn hàng" aria-label="Tìm mã đơn hàng"><select id="order-filter" aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option>${Object.entries(orderLabels).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('')}</select>`;
      list.before(controls);
    }
  }
  if(path.startsWith('/orders/')){
    const actions=document.querySelector('.nx-timeline+.nx-actions');
    if(actions){
      const id=decodeURIComponent(path.slice(8)),order=shop.order(id);
      const button=document.createElement('button');button.className='btn btn-outline';button.textContent='Mua lại';button.dataset.action='reorder';button.dataset.id=id;actions.append(button);
      if(['VNPAY_DEMO','MOMO_DEMO'].includes(order.paymentMethod)&&['PENDING','FAILED'].includes(order.paymentStatus)&&order.status!=='CANCELLED'){
        actions.querySelectorAll('[data-action="pay-success"],[data-action="pay-fail"],[data-action="retry"]').forEach(node=>node.remove());
        const link=document.createElement('a');link.className='btn btn-primary';link.href=`/payment-demo/${encodeURIComponent(id)}`;link.dataset.link='';link.textContent=order.paymentStatus==='FAILED'?'Thử lại thanh toán demo':'Tiếp tục thanh toán demo';actions.prepend(link);
      }
      const paymentPanel=document.querySelector('aside.nx-stack .nx-panel:last-child');
      if(paymentPanel&&order.paymentMethod==='BANK_DEMO'&&order.paymentStatus==='PENDING'){
        const note=document.createElement('p');note.className='nx-payment-guide';note.textContent='Chuyển khoản chỉ là mô phỏng. Không có số tài khoản hoặc mã QR thật; quản trị demo xác nhận trạng thái sau đối soát giả lập.';paymentPanel.append(note);
      }
    }
  }
  if(path==='/admin'&&shop.session?.role==='ADMIN_DEMO'){
    const view=new URLSearchParams(location.search).get('view')||'overview';
    if(view==='overview'){
      const panel=document.createElement('section');panel.className='nx-panel';
      const paid=shop.orders().filter(o=>o.paymentStatus==='PAID');
      const byDate=Object.groupBy(paid,o=>new Date(o.createdAt).toLocaleDateString('vi-VN'));
      const entries=Object.entries(byDate).slice(-7).map(([date,orders])=>[date,orders.reduce((sum,o)=>sum+o.total,0)]);
      const peak=Math.max(1,...entries.map(x=>x[1]));
      panel.innerHTML=`<h2>Doanh thu đã thu theo ngày</h2><div class="nx-chart">${entries.length?entries.map(([date,total])=>`<div><span style="height:${Math.max(6,total/peak*100)}%" title="${money(total)}"></span><small>${esc(date)}</small></div>`).join(''):'<p>Chưa có doanh thu đã xác nhận.</p>'}</div><h3>Sản phẩm sắp hết hàng</h3>${shop.data.products.flatMap(p=>p.variants.map(v=>({p,v,left:shop.available(v.sku)}))).filter(x=>x.left<=5).map(x=>`<p>${esc(x.p.name)} · ${esc(x.v.sku)}: <b>${x.left}</b></p>`).join('')||'<p>Chưa có sản phẩm sắp hết hàng.</p>'}`;
      document.querySelector('.kpis')?.after(panel);
    }
    if(view==='products'){
      const panel=document.querySelector('.admin-content>.nx-panel');
      const tools=document.createElement('div');tools.className='nx-product-tools';
      tools.innerHTML=`<h3>Ẩn / hiện sản phẩm</h3>${shop.allProducts().map(p=>`<div class="nx-admin-row"><span><b>${esc(p.name)}</b><small>${p.active?'Đang bán':'Đã ẩn'}</small></span><button class="btn btn-outline" data-action="toggle-product" data-sku="${esc(p.variants[0].sku)}" data-active="${p.active?'false':'true'}">${p.active?'Ẩn':'Hiện'}</button></div>`).join('')}`;
      panel?.append(tools);
    }
    if(view==='overview'||view==='orders'){
      document.querySelectorAll('.admin-content table tbody tr').forEach(row=>{
        const id=row.querySelector('td a')?.textContent,order=shop.orders().find(o=>o.id===id);
        if(order?.paymentStatus==='REFUND_PENDING'){
          const button=document.createElement('button');button.className='btn btn-outline';button.textContent='Hoàn tiền demo';button.dataset.action='refund-demo';button.dataset.id=id;
          row.lastElementChild.append(button);
        }
      });
    }
    if(view==='customers'){
      document.querySelectorAll('.nx-admin-row').forEach((row,index)=>{const user=shop.data.users[index];if(!user)return;const orders=shop.orders().filter(o=>o.owner===`u:${user.email}`);const small=row.querySelector('small');small.textContent+=` · ${orders.length} đơn · ${money(orders.filter(o=>o.paymentStatus==='PAID').reduce((sum,o)=>sum+o.total,0))} đã thu`;});
    }
  }
};
document.addEventListener('change',event=>{
  if(event.target.id==='saved-address'){
    const address=shop.profile()?.addresses?.[Number(event.target.value)];if(!address)return;
    const form=document.querySelector('#checkout-form');for(const [key,value] of Object.entries(address)){if(form.elements[key])form.elements[key].value=value;}
    checkoutDraft=Object.fromEntries(new FormData(form).entries());
  }
  if(event.target.id==='order-filter'||event.target.id==='order-search')filterOrders();
},true);
document.addEventListener('input',event=>{if(event.target.id==='order-search')filterOrders();if(location.pathname==='/checkout'&&event.target.closest('#checkout-form')){checkoutDraft=Object.fromEntries(new FormData(event.target.form).entries());const error=document.querySelector('#checkout-error');if(error)error.hidden=true;if(event.target.name==='province')updateCheckoutTotals();}});
document.addEventListener('change',event=>{if(location.pathname==='/checkout'&&event.target.closest('#checkout-form')){checkoutDraft=Object.fromEntries(new FormData(event.target.form).entries());if(event.target.name==='paymentMethod'){checkoutPayment=event.target.value;updateCheckoutMethod();}}},true);
function filterOrders(){const status=document.querySelector('#order-filter')?.value||'',search=(document.querySelector('#order-search')?.value||'').trim().toLowerCase();document.querySelectorAll('.nx-order-card').forEach((card,index)=>{const order=shop.orders()[index];card.hidden=!!((status&&order.status!==status)||(search&&!order.id.toLowerCase().includes(search)));});}
function updateCheckoutTotals(){const form=document.querySelector('#checkout-form');if(!form)return;try{const buy=JSON.parse(sessionStorage.getItem('nx_buy_now')||'null'),lines=buy?[buy]:shop.selectedLines(),value=shop.estimate(lines,couponCode,checkoutDelivery,form.elements.province.value);const summary=document.querySelector('.summary');if(summary){const cells=summary.querySelectorAll('.nx-summary-line b');if(cells[0])cells[0].textContent=money(value.subtotal);if(cells[1])cells[1].textContent='-'+money(value.discount);if(cells[2])cells[2].textContent=money(value.shipping);summary.querySelector('.nx-grand strong').textContent=money(value.total);}const submit=form.querySelector('button:not([type])');if(submit){submit.dataset.total=money(value.total);updateCheckoutMethod();}}catch(error){toast(error.message);}}
function updateCheckoutMethod(){
  const form=document.querySelector('#checkout-form'),guide=document.querySelector('#payment-guide');if(!form||!guide)return;
  const methods={
    COD:['Thanh toán khi nhận hàng','Đơn được tạo ngay. Bạn trả tiền khi đơn đã giao.','Đặt đơn COD'],
    BANK_DEMO:['Chuyển khoản mô phỏng','Không có số tài khoản hoặc mã QR nhận tiền thật. Quản trị demo sẽ xác nhận giao dịch giả lập.','Tạo đơn chuyển khoản demo'],
    VNPAY_DEMO:['VNPAY mô phỏng','Sau khi tạo đơn, bạn sẽ đến màn hình chọn kết quả thanh toán giả lập. Không nhập thẻ hoặc OTP.','Tiếp tục với VNPAY demo'],
    MOMO_DEMO:['MoMo mô phỏng','Sau khi tạo đơn, bạn sẽ đến màn hình chọn kết quả thanh toán giả lập. Không đăng nhập ví thật.','Tiếp tục với MoMo demo']
  };
  const [name,description,label]=methods[checkoutPayment]||methods.COD;
  guide.innerHTML=`<b>${name}</b><p>${description}</p>`;
  const submit=form.querySelector('button:not([type])');if(submit)submit.textContent=`${label} · ${submit.dataset.total||'0 ₫'}`;
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action="reorder"],[data-action="toggle-product"],[data-action="refund-demo"]');
  if(!target)return;
  try{
    if(target.dataset.action==='reorder'){
      const order=shop.order(target.dataset.id);
      const lines=order.items.map(item=>{
        const already=Number(shop.cart().find(x=>x.sku===item.sku)?.qty||0);
        return{sku:item.sku,qty:Math.min(item.qty,Math.max(0,shop.available(item.sku)-already))};
      }).filter(line=>line.qty>0);
      if(!lines.length)throw new Error('Các sản phẩm trong đơn hiện không còn hàng để mua lại.');
      for(const line of lines)shop.addCart(line.sku,line.qty);
      go('/cart');toast('Đã thêm sản phẩm còn hàng vào giỏ');
    }else if(target.dataset.action==='refund-demo'){
      await orderAction(target.dataset.id,'refund',{},true,()=>shop.markRefundedDemo(target.dataset.id));render();toast('Đã ghi nhận hoàn tiền mô phỏng');
    }else{
      shop.setProduct(target.dataset.sku,{active:target.dataset.active==='true'});render();
    }
  }catch(error){toast(error.message);}
});
// Đơn đã lưu trên máy chủ: máy chủ quyết định trước, trình duyệt cập nhật theo.
// Đơn chỉ có trong trình duyệt (chạy local không có MySQL) vẫn xử lý như cũ.
async function orderAction(id,action,body,admin,local){
  const order=shop.order(id);
  const remote=order.sync?(admin?await api.adminAction(id,action,body):await api.customerAction(id,order.sync.accessToken,action,body)):null;
  try{local();}catch(error){if(!remote)throw error;}
  if(remote)shop.applyServerState(id,remote);
}
async function revokeAdminSession(){
  if(!adminAuthorized)return;
  const response=await fetch('/api/admin/logout',{method:'POST',credentials:'same-origin'});
  if(!response.ok)throw new Error('Không thể kết thúc phiên quản trị trên máy chủ.');
  adminAuthorized=false;shop.logout();
}
document.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='admin-login-form')return;
  event.preventDefault();event.stopImmediatePropagation();
  const button=form.querySelector('button'),error=form.querySelector('#admin-login-error');
  button.disabled=true;error.hidden=true;
  try{
    const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Không thể đăng nhập quản trị.');
    adminAuthorized=true;shop.enterAdminPreview();go('/admin');toast('Đăng nhập quản trị thành công.');
  }catch(reason){error.textContent=reason.message;error.hidden=false;button.disabled=false;}
},true);
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action="logout"]');
  if(!button||!adminAuthorized||shop.session?.role!=='ADMIN_DEMO')return;
  event.preventDefault();event.stopImmediatePropagation();
  try{await revokeAdminSession();go('/');toast('Đã đăng xuất quản trị.');}catch(error){toast(error.message);}
},true);
try{
  const response=await fetch('/api/admin/session',{credentials:'same-origin'});
  if(response.ok){adminAuthorized=true;shop.enterAdminPreview();}
  else if(shop.session?.role==='ADMIN_DEMO')shop.logout();
}catch{if(shop.session?.role==='ADMIN_DEMO')shop.logout();}
render();
