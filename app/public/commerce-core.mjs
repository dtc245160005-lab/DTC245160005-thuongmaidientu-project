export const nextOrderStates = Object.freeze({
  PENDING_CONFIRMATION:['CONFIRMED','CANCELLED'],
  CONFIRMED:['PREPARING','CANCELLED'],
  PREPARING:['SHIPPING','CANCELLED'],
  SHIPPING:['DELIVERED'],
  DELIVERED:['COMPLETED','RETURN_REQUESTED'],
  COMPLETED:['RETURN_REQUESTED'],
  RETURN_REQUESTED:['RETURNED'],
  CANCELLED:[], RETURNED:[]
});
export const activeReservationStates = new Set(['PENDING_CONFIRMATION','CONFIRMED','PREPARING']);
export const paymentMethods = Object.freeze(['COD','BANK_DEMO','VNPAY_DEMO','MOMO_DEMO']);
export const integerQuantity = value => Number.isInteger(Number(value)) && Number(value)>0 && Number(value)<=99;
export function quote(lines,catalog,inventory,coupon,delivery='HOME',region=''){
  if (!Array.isArray(lines)||!lines.length) throw new Error('Chọn ít nhất một sản phẩm.');
  const quantities=new Map();
  for(const line of lines){
    if(!integerQuantity(line.qty))throw new Error('Số lượng không hợp lệ.');
    quantities.set(line.sku,(quantities.get(line.sku)||0)+Number(line.qty));
  }
  const result = lines.map(line => {
    const product = catalog.find(item => item.variants.some(v => v.sku===line.sku));
    const variant = product?.variants.find(v => v.sku===line.sku);
    if (!product?.active||!variant) throw new Error('Sản phẩm không còn bán.');
    if (!integerQuantity(line.qty)) throw new Error('Số lượng không hợp lệ.');
    const available = (inventory[variant.sku]?.onHand??variant.stock)-(inventory[variant.sku]?.reserved??0);
    if (quantities.get(line.sku)>available) throw new Error(`${product.name} chỉ còn ${available} sản phẩm.`);
    return {sku:variant.sku,productId:product.id,name:product.name,variant:variant.label,unitPrice:variant.price,qty:Number(line.qty),imageIndex:product.imageIndex};
  });
  const subtotal=result.reduce((sum,item)=>sum+item.unitPrice*item.qty,0);
  const validCoupon=coupon?.active&&subtotal>=coupon.minimum?coupon:null;
  const discount=validCoupon?Math.round(subtotal*validCoupon.value/100):0;
  const shipping=delivery==='STORE'||subtotal>=2000000?0:(region==='Hà Nội'?20000:35000);
  return {items:result,subtotal,discount,shipping,total:subtotal-discount+shipping,coupon:validCoupon?.code||null};
}
export function canTransition(order,next){
  if (!nextOrderStates[order.status]?.includes(next)) return false;
  if (['PREPARING','SHIPPING'].includes(next)&&order.paymentMethod!=='COD'&&order.paymentStatus!=='PAID') return false;
  return true;
}
export function availableStock(inventory,variant){
  const entry=inventory[variant.sku]||{onHand:variant.stock,reserved:0};
  return Math.max(0,entry.onHand-entry.reserved);
}
