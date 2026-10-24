# Website thương mại điện tử - Đề 9

Sinh viên: **Ma Đình Tuyển**
MSSV: **DTC245160005**

## Giới thiệu

Website bán hàng trực tuyến có chức năng quản lý sản phẩm, giỏ hàng và đơn hàng. Dữ liệu được lưu trong MySQL. Hệ thống được triển khai bằng Docker Compose trên máy ảo Ubuntu.

## Luồng mua hàng NEXTECH demo

Giao diện NEXTECH hiện có trang chủ, chi tiết sản phẩm theo biến thể/SKU, giỏ hàng, thanh toán, danh sách và chi tiết đơn hàng, đăng nhập/đăng ký, hồ sơ/địa chỉ và các mục quản trị demo. Dữ liệu của các trang này dùng chung `app/public/commerce-service.mjs` và lưu trong LocalStorage; phiên đăng nhập nằm trong SessionStorage. Mã `NEX10` giảm 10% cho đơn demo.

Luồng thanh toán hỗ trợ COD, chuyển khoản mô phỏng, VNPAY mô phỏng và MoMo mô phỏng. Các nút thanh toán trực tuyến chỉ tạo kết quả giả lập; không có kết nối cổng thanh toán, tài khoản nhận tiền hoặc giao dịch thật. Đơn hàng có mã chống tạo trùng, giữ tồn kho khi đặt, trừ tồn khi giao và trả tồn khi hủy trước giao. Đơn demo chờ thanh toán quá hạn được hủy và trả tồn khi ứng dụng được mở hoặc thao tác lại (15 phút cho ví, 24 giờ cho chuyển khoản). Các thao tác quản trị sử dụng cùng dữ liệu demo và chỉ xuất hiện trong chế độ quản trị demo; đây **không phải** phân quyền máy chủ. Không dùng bản này để lưu thông tin khách hàng hoặc nhận thanh toán thật.

Để thử thanh toán: thêm sản phẩm vào giỏ, mở `/checkout`, điền đầy đủ thông tin nhận hàng và chọn phương thức. COD tạo đơn rồi chờ trả tiền khi nhận hàng. VNPAY/MoMo demo mở trang `/payment-demo/:id` để chọn kết quả thành công hoặc thất bại giả lập. Chuyển khoản demo tạo đơn chờ quản trị demo đối soát; không có tài khoản ngân hàng hay mã QR thật. Lỗi nhập liệu được hiển thị ngay dưới nút đặt hàng.

Chạy nhanh: `cd app`, `npm ci`, `npm start`; mở `http://localhost:3000/`. Kiểm tra logic bằng `npm test`. Tài khoản khách demo: `demo@nextech.vn` / `Nextech@2026`. Có thể tạo tài khoản mới ngay trên trang đăng ký.

Tài khoản quản trị local được tạo một lần bằng `cd app && npm run admin:create`; lệnh in email/mật khẩu duy nhất và ghi **bản băm mật khẩu** vào `app/.env.local` (đã bị Git bỏ qua). Khởi động lại `npm start`, vào `/admin/login` để đăng nhập. Express xác minh mật khẩu, giới hạn số lần thử sai và cấp cookie phiên `HttpOnly` có hạn 8 giờ. Đăng xuất hủy phiên trên máy chủ. Với Docker, cấu hình `ADMIN_EMAIL` và `ADMIN_PASSWORD_HASH` trong `.env` riêng trước khi chạy. Các thao tác quản trị NEXTECH vẫn thay đổi dữ liệu demo LocalStorage; đăng nhập máy chủ chưa biến dữ liệu đó thành hệ thống phân quyền sản xuất.

API Express/MySQL cũ vẫn nằm trong `app/server.js`, phục vụ bộ dữ liệu Petshop ban đầu và **chưa nối** với giao diện NEXTECH. Vì vậy NEXTECH hiện là bản demo trong một trình duyệt, không đồng bộ giữa thiết bị. Để triển khai thật cần thay lớp dữ liệu demo bằng API, lưu đơn hàng và tồn kho trong giao dịch MySQL, xác thực và phân quyền trên máy chủ, tích hợp sandbox thanh toán, rồi mới đưa lên môi trường công khai. Docker/MySQL chưa được kiểm thử trong lần nâng cấp này.

## Thành phần hệ thống

| Thành phần | Vai trò |
|---|---|
| Node.js và Express | Xử lý website và API |
| MySQL | Lưu sản phẩm, đơn hàng và dữ liệu ứng dụng |
| phpMyAdmin | Xem và quản lý cơ sở dữ liệu |
| Nginx | Reverse proxy, HTTPS và security headers |
| Prometheus và Grafana | Thu thập, hiển thị số liệu giám sát |
| Loki và Promtail | Thu thập, lưu trữ và truy vấn log |

## Chuẩn bị môi trường

- Máy Ubuntu có Docker Engine và Docker Compose v2.
- Tạo file `.env` từ `.env.example`, sau đó đặt mật khẩu riêng.
- File `.env` và khóa HTTPS không được đưa lên GitHub.

## Chạy hệ thống

Sau khi hoàn thành các file ứng dụng và cấu hình:

```bash
docker compose up -d --build
docker compose ps
```

Dừng hệ thống và giữ lại dữ liệu MySQL:

```bash
docker compose down
```

## Địa chỉ truy cập dự kiến

| Thành phần | Địa chỉ |
|---|---|
| Website | `https://192.168.126.134/` |
| phpMyAdmin | `https://192.168.126.134/phpmyadmin/` |
| Prometheus | `https://192.168.126.134/prometheus/` |
| Grafana | `https://192.168.126.134/grafana/` |

Các địa chỉ trên sẽ được kiểm tra khi triển khai Nginx và các dịch vụ tương ứng.

## Cấu trúc thư mục

- `app/`: mã nguồn website và Dockerfile.
- `db/init/`: cấu trúc cơ sở dữ liệu và tài khoản MySQL.
- `nginx/`: cấu hình reverse proxy.
- `prometheus/`, `grafana/`: cấu hình giám sát.
- `loki/`, `promtail/`: cấu hình thu thập log.
- `docs/screenshots/`: ảnh minh chứng cho báo cáo.

## Bảo mật

Hệ thống sẽ sử dụng tài khoản MySQL riêng cho ứng dụng, mật khẩu đặt trong `.env`, phân tách mạng Docker, hạn chế cổng công khai và security headers của Nginx. Các biện pháp sẽ được kiểm tra sau khi triển khai.
