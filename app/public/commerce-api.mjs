// Gọi API đơn hàng NEXTECH (MySQL). Lỗi có offlineDemo=true nghĩa là máy chủ
// đang chạy local không có MySQL và cho phép giữ đơn tạm trong trình duyệt.
export class ApiError extends Error {
  constructor(message,status,offlineDemo=false){super(message);this.status=status;this.offlineDemo=offlineDemo;}
}
async function call(path,body,headers={},method='POST'){
  let response;
  const raw=body instanceof Blob;
  try{
    response=await fetch(path,{method,credentials:'same-origin',headers:raw?headers:{'Content-Type':'application/json',...headers},body:['GET','DELETE'].includes(method)?undefined:raw?body:JSON.stringify(body||{})});
  }catch{throw new ApiError('Không kết nối được máy chủ. Vui lòng thử lại.',0);}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new ApiError(result.error||'Máy chủ không xử lý được yêu cầu.',response.status,result.offlineDemo===true);
  return result;
}
export const newAccessToken=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
export const createOrder=input=>call('/api/nextech/orders',input);
export const customerAction=(id,token,action,body)=>call(`/api/nextech/orders/${encodeURIComponent(id)}/${action}`,body,{'X-Order-Token':token});
export const listProducts=()=>call('/api/nextech/products',null,{},'GET');
export const adminListProducts=()=>call('/api/admin/products',null,{},'GET');
export const adminDeleteProduct=sku=>call(`/api/admin/products/${encodeURIComponent(sku)}`,null,{},'DELETE');
export const adminCreateProduct=input=>call('/api/admin/products',input);
export const adminUpdateProduct=(sku,changes)=>call(`/api/admin/products/${encodeURIComponent(sku)}`,changes);
export const adminUploadImage=(sku,file)=>call(`/api/admin/products/${encodeURIComponent(sku)}/image`,file,{'Content-Type':file.type},'PUT');
export const adminAction=(id,action,body)=>call(`/api/admin/orders/${encodeURIComponent(id)}/${action}`,body);
