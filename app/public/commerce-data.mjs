export const catalog = [
  ['macbook-air-m3','MacBook Air 13 inch M3','Apple','Laptop',25990000,28990000,12,'Laptop mỏng nhẹ với chip M3, pin cả ngày và màn hình Liquid Retina.'],
  ['macbook-pro-m3','MacBook Pro 14 inch M3 Pro','Apple','Laptop',42990000,46990000,7,'Sức mạnh cho công việc sáng tạo và xử lý chuyên nghiệp.'],
  ['iphone-16-pro-max','iPhone 16 Pro Max 256GB','Apple','Điện thoại',33990000,36990000,9,'Camera linh hoạt, hiệu năng vượt trội và thiết kế titan.'],
  ['samsung-galaxy-s','Samsung Galaxy S Series','Samsung','Điện thoại',19990000,22990000,15,'Trải nghiệm Galaxy AI trên màn hình sắc nét.'],
  ['ipad-air-m2','iPad Air M2 11 inch','Apple','Tablet',15990000,17990000,11,'Máy tính bảng linh hoạt cho học tập và sáng tạo.'],
  ['apple-watch-series-10','Apple Watch Series 10 GPS','Apple','Phụ kiện',9790000,10990000,8,'Theo dõi sức khỏe và kết nối thuận tiện mỗi ngày.'],
  ['sony-wh-1000xm5','Sony WH-1000XM5 Chống ồn','Sony','Âm thanh',7490000,8990000,5,'Tai nghe chụp tai chống ồn cho không gian nghe tập trung.'],
  ['airpods-pro-2','AirPods Pro thế hệ 2','Apple','Âm thanh',5290000,6490000,17,'Âm thanh thích ứng và hộp sạc USB-C nhỏ gọn.'],
  ['galaxy-buds3-pro','Samsung Galaxy Buds3 Pro','Samsung','Âm thanh',4290000,5490000,19,'Tai nghe không dây gọn nhẹ với âm thanh sống động.'],
  ['keyboard-rgb-pro','Bàn phím cơ RGB Pro','Keychron','Gaming',2190000,2790000,6,'Bàn phím cơ cho trải nghiệm gõ chính xác.'],
  ['gaming-mouse','Chuột gaming không dây','Logitech','Gaming',1590000,1990000,22,'Chuột không dây nhanh nhạy cho chơi game và làm việc.'],
  ['dualsense-controller','Tay cầm chơi game DualSense','Sony','Gaming',1790000,2190000,14,'Tay cầm không dây với phản hồi xúc giác.']
].map((row,index) => {
  const [slug,name,brand,category,price,oldPrice,stock,description] = row;
  const id = index + 1;
  const base = { sku:`NX-${String(id).padStart(3,'0')}-STD`, label:category==='Laptop'?'16GB · 256GB':category==='Điện thoại'?'256GB':category==='Tablet'?'128GB':'Tiêu chuẩn', price, oldPrice, stock, color:category==='Điện thoại'?'Titan':'Đen' };
  const variants = [base];
  if (['Laptop','Điện thoại','Tablet'].includes(category)) variants.push({ sku:`NX-${String(id).padStart(3,'0')}-PLUS`, label:category==='Laptop'?'24GB · 512GB':category==='Điện thoại'?'512GB':'256GB', price:price+3000000, oldPrice:oldPrice+3000000, stock:Math.max(2,Math.floor(stock/2)), color:'Bạc' });
  return {id,slug,name,brand,category,description,variants,imageIndex:index,warranty:'Bảo hành chính hãng 12 tháng',active:true};
});

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
