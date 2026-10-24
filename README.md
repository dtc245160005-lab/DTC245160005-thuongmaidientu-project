# Website thương mại điện tử - Đề 9

Sinh viên: **Ma Đình Tuyển**
MSSV: **DTC245160005**

## Giới thiệu

Website bán hàng trực tuyến có chức năng quản lý sản phẩm, giỏ hàng và đơn hàng. Dữ liệu được lưu trong MySQL. Hệ thống được triển khai bằng Docker Compose trên máy ảo Ubuntu.

## Luồng mua hàng NEXTECH demo

Giao diện NEXTECH hiện có trang chủ, chi tiết sản phẩm theo biến thể/SKU, giỏ hàng, thanh toán, danh sách và chi tiết đơn hàng, đăng nhập/đăng ký, hồ sơ/địa chỉ và các mục quản trị demo. Mã `NEX10` giảm 10% cho đơn demo.

**Đơn hàng lưu trong MySQL.** Khi đặt hàng, trình duyệt chỉ gửi SKU, số lượng, địa chỉ và phương thức thanh toán tới `POST /api/nextech/orders` (`app/nextech-orders.cjs`). Máy chủ tự tính giá từ bảng `nx_products`, kiểm tra và giữ tồn kho trong bảng `nx_inventory` bằng giao dịch `SELECT … FOR UPDATE` (không bán vượt tồn kho khi nhiều người đặt cùng lúc), rồi lưu vào `nx_orders`, `nx_order_items` và `nx_order_events`. Đơn mới làm tăng `thuongmaidientu_orders_created_total` và `thuongmaidientu_revenue_vnd_total`, nên số liệu trên Grafana thay đổi theo. Hủy đơn, thanh toán giả lập và đổi trả đều được máy chủ kiểm tra trước. Khách hàng xác thực bằng mã bí mật của đơn (`X-Order-Token`, máy chủ chỉ lưu bản băm SHA-256). Các thao tác quản trị (`/api/admin/orders/...`) bắt buộc phải có cookie phiên quản trị. Đơn chờ thanh toán quá hạn được máy chủ hủy mỗi phút và trả lại tồn kho.

Sản phẩm, tài khoản khách, địa chỉ và mã khuyến mãi vẫn lưu trong LocalStorage của trình duyệt (`commerce-service.mjs`). Phiên đăng nhập khách nằm trong SessionStorage. Khi chạy local mà không có MySQL (không đặt `NODE_ENV=production`), đơn được lưu tạm trong trình duyệt và giao diện có thông báo. Trên production thì báo lỗi, không lưu tạm.

Luồng thanh toán hỗ trợ COD, chuyển khoản mô phỏng, VNPAY mô phỏng và MoMo mô phỏng. Các nút thanh toán trực tuyến chỉ tạo kết quả giả lập; không có kết nối cổng thanh toán, tài khoản nhận tiền hoặc giao dịch thật. Đơn hàng có mã chống tạo trùng, giữ tồn kho khi đặt, trừ tồn khi giao và trả tồn khi hủy trước giao. Đơn demo chờ thanh toán quá hạn được hủy và trả tồn khi ứng dụng được mở hoặc thao tác lại (15 phút cho ví, 24 giờ cho chuyển khoản). Các thao tác quản trị sử dụng cùng dữ liệu demo và chỉ xuất hiện trong chế độ quản trị demo; đây **không phải** phân quyền máy chủ. Không dùng bản này để lưu thông tin khách hàng hoặc nhận thanh toán thật.

Để thử thanh toán: thêm sản phẩm vào giỏ, mở `/checkout`, điền đầy đủ thông tin nhận hàng và chọn phương thức. COD tạo đơn rồi chờ trả tiền khi nhận hàng. VNPAY/MoMo demo mở trang `/payment-demo/:id` để chọn kết quả thành công hoặc thất bại giả lập. Chuyển khoản demo tạo đơn chờ quản trị demo đối soát; không có tài khoản ngân hàng hay mã QR thật. Lỗi nhập liệu được hiển thị ngay dưới nút đặt hàng.

Chạy nhanh: `cd app`, `npm ci`, `npm start`; mở `http://localhost:3000/`. Kiểm tra logic bằng `npm test`. Tài khoản khách demo: `demo@nextech.vn` / `Nextech@2026`. Có thể tạo tài khoản mới ngay trên trang đăng ký.

Tài khoản quản trị local được tạo một lần bằng `cd app && npm run admin:create`; lệnh in email/mật khẩu duy nhất và ghi **bản băm mật khẩu** vào `app/.env.local` (đã bị Git bỏ qua). Khởi động lại `npm start`, vào `/admin/login` để đăng nhập. Express xác minh mật khẩu, giới hạn số lần thử sai và cấp cookie phiên `HttpOnly` có hạn 8 giờ. Đăng xuất hủy phiên trên máy chủ. Với Docker, cấu hình `ADMIN_EMAIL` và `ADMIN_PASSWORD_HASH` trong `.env` riêng trước khi chạy. Các thao tác quản trị NEXTECH vẫn thay đổi dữ liệu demo LocalStorage; đăng nhập máy chủ chưa biến dữ liệu đó thành hệ thống phân quyền sản xuất.

API Express/MySQL cũ (`/api/products`, `/api/cart`, `/api/orders`) vẫn nằm trong `app/server.js` và phục vụ bộ dữ liệu Petshop ban đầu. Để triển khai thật vẫn cần chuyển sản phẩm, tài khoản khách và khuyến mãi lên máy chủ, đồng thời tích hợp sandbox thanh toán.

**Cập nhật CSDL đang chạy.** File `db/init/03-nextech.sql` chỉ tự chạy khi volume MySQL được tạo lần đầu. Với volume đã có dữ liệu, chạy một lần lệnh sau (ứng dụng sẽ tự thêm tồn kho ban đầu khi khởi động):

```bash
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < db/init/03-nextech.sql
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < db/init/04-nextech-products.sql
docker compose up -d --build app
```

**Thêm sản phẩm có ảnh.** Trong trang quản trị, mục "Sản phẩm & tồn kho", form "Thêm sản phẩm" cho phép chọn ảnh từ máy (PNG, JPEG, WebP, GIF, tối đa 2 MB). Sản phẩm được lưu vào bảng `nx_products`, ảnh lưu ngay trong MySQL (cột `MEDIUMBLOB`) và được phục vụ qua `/api/nextech/products/<SKU>/image`. Mọi trình duyệt đều thấy sản phẩm này và đặt mua được. Máy chủ kiểm tra cả loại tệp lẫn nội dung ảnh, nên không tải lên được tệp không phải ảnh. Giá, tồn kho, ảnh (nút "Đổi ảnh") và trạng thái ẩn/hiện được sửa trên máy chủ. Nút "Xóa" gỡ sản phẩm khỏi cửa hàng, còn đơn hàng cũ vẫn được giữ. Cửa hàng không còn sản phẩm mẫu cố định: mọi sản phẩm đều do quản trị thêm và bắt buộc có ảnh. Hai banner cạnh ảnh lớn ở trang chủ hiển thị sản phẩm có ảnh và còn hàng.

**Đặt hàng cần đăng nhập.** Khách phải đăng nhập tài khoản khách hàng mới vào được trang thanh toán. Đây là kiểm tra phía giao diện, vì tài khoản khách vẫn lưu trong trình duyệt.

**Kiểm thử.** `npm test` chạy logic giao diện và API (không cần MySQL). Muốn kiểm thử với MySQL thật, khởi tạo một MySQL tạm từ `db/init` rồi chạy `NX_TEST_DB_PORT=<cổng> npm test`. Tài khoản mặc định là `app`/`apppw`, có thể đổi bằng `NX_TEST_DB_USER` và `NX_TEST_DB_PASSWORD`.

**Route demo log lỗi.** Trên production, `GET /api/debug/error` bị tắt (trả 404). Khi cần demo Loki/Grafana, đặt `ENABLE_DEBUG_ROUTES=true` trong `.env`, chạy `docker compose up -d app`, demo xong thì đặt lại `false`.

**Giới hạn đăng nhập quản trị theo IP.** Ứng dụng chỉ tin header `X-Forwarded-For` khi `TRUST_PROXY` được cấu hình. Docker Compose đặt `TRUST_PROXY=loopback, uniquelocal` vì app chỉ nhận kết nối từ Nginx trong mạng Docker nội bộ. Khi chạy trực tiếp bằng `npm start`, biến này để trống, nên giả header `X-Forwarded-For` không né được giới hạn 5 lần thử sai.

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
