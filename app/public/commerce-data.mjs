// Sản phẩm do quản trị thêm trong trang quản trị và lưu trong MySQL (bảng nx_products);
// giao diện tải danh sách qua /api/nextech/products. Không còn sản phẩm mẫu cố định.
export const catalog = [];

export const seededCoupons = [{code:'NEX10',type:'percent',value:10,active:true,minimum:0}];
export const orderLabels = {
  PENDING_CONFIRMATION:'Chờ xác nhận', CONFIRMED:'Đã xác nhận', PREPARING:'Đang chuẩn bị',
  SHIPPING:'Đang giao', DELIVERED:'Đã giao', COMPLETED:'Hoàn thành',
  CANCELLED:'Đã hủy', RETURN_REQUESTED:'Yêu cầu đổi trả', RETURNED:'Đã đổi trả'
};
export const paymentLabels = {
  UNPAID:'Chưa thanh toán', PENDING:'Chờ thanh toán', PAID:'Đã thanh toán',
  FAILED:'Thất bại', REFUND_PENDING:'Chờ hoàn tiền', REFUNDED:'Đã hoàn tiền'
};
