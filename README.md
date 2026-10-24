# Website thương mại điện tử NEXTECH - Đề 9

Sinh viên: **Ma Đình Tuyển**
MSSV: **DTC245160005**
Học phần: Triển khai và Quản trị Hệ thống Phần mềm

## Giới thiệu

NEXTECH là website bán thiết bị công nghệ: khách xem sản phẩm, thêm vào giỏ, đăng nhập để đặt hàng và theo dõi đơn; quản trị viên thêm sản phẩm kèm ảnh, quản lý tồn kho và xử lý đơn hàng. Ứng dụng viết bằng Node.js 22 + Express, dữ liệu lưu trong MySQL 8.4, toàn bộ hệ thống chạy bằng Docker Compose (12 container) trên máy ảo Ubuntu `192.168.126.134`.

## Thành phần hệ thống

| Thành phần | Phiên bản | Vai trò |
|---|---|---|
| Node.js + Express (`app`) | Node 22 | Website NEXTECH, API, `/metrics` |
| MySQL (`db`) | 8.4 | Sản phẩm, ảnh, tồn kho, đơn hàng |
| phpMyAdmin | 5.2 | Quản trị cơ sở dữ liệu |
| Nginx | 1.27 (unprivileged) | Reverse proxy, HTTPS, security headers, rate limit |
| Prometheus | 2.53 | Thu thập metrics (6 job), 4 luật cảnh báo |
| Grafana | 11.3 | Dashboard "Thương mại điện tử - Tổng quan hệ thống" |
| cAdvisor, node-exporter, nginx-exporter, mysqld-exporter | | Metrics container, máy chủ, Nginx, MySQL |
| Loki + Promtail | 3.0 | Thu thập và truy vấn log tập trung |

Các mốc commit chính: `ded39cb` (Commit 1: ứng dụng, MySQL, Nginx HTTPS), `172266d` (Commit 2: Prometheus, Grafana), `ea1ebb5` (Commit 3: Loki, Promtail), `bc1dabf` (kiểm chứng hardening).

## Cài đặt và chạy từ đầu

Yêu cầu: Ubuntu có Docker Engine và Docker Compose v2, `openssl`. Các lệnh chạy trong thư mục dự án.

### 1. Lấy mã nguồn

```bash
git clone https://github.com/dtc245160005-lab/DTC245160005-thuongmaidientu-project.git ~/thuongmaidientu-project
cd ~/thuongmaidientu-project
```

### 2. Tạo file `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Mở `.env`, sửa `SERVER_IP` thành IP của máy và thay mọi giá trị `doi_mat_khau_...` bằng mật khẩu mạnh. Có thể sinh mật khẩu ngẫu nhiên bằng `openssl rand -base64 18`.

### 3. Tạo chứng chỉ HTTPS tự ký

Chứng chỉ và khóa không có trên GitHub, phải tạo trên máy chủ. Thay `192.168.126.134` bằng IP của máy:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout nginx/certs/server.key -out nginx/certs/server.crt \
  -subj "/CN=192.168.126.134" -addext "subjectAltName=IP:192.168.126.134"
chmod 600 nginx/certs/server.key
sudo chown 101:101 nginx/certs/server.key
```

### 4. Tạo tài khoản Basic Auth cho phpMyAdmin và Prometheus

```bash
printf "admin:$(openssl passwd -apr1 'DAT_MAT_KHAU_MANH_O_DAY')\n" > nginx/.htpasswd
sudo chgrp 101 nginx/.htpasswd
chmod 640 nginx/.htpasswd
```

> Phải tạo `nginx/.htpasswd` **trước** khi chạy `docker compose up`. Nếu file chưa có, Docker tự tạo một **thư mục** trùng tên và Nginx không khởi động được. Khi đó chạy `sudo rm -r nginx/.htpasswd`, tạo lại file theo lệnh trên rồi `docker compose up -d nginx`.

### 5. Tạo tài khoản quản trị NEXTECH

Build image ứng dụng rồi sinh mật khẩu và bản băm (mật khẩu chỉ in ra một lần, hãy ghi lại):

```bash
docker compose build app
docker compose run --rm --no-deps app node -e "const c=require('crypto'),{hashPassword}=require('./admin-auth.cjs');const p='Nx@'+c.randomBytes(15).toString('base64url');console.log('Mat khau: '+p);console.log(\"ADMIN_PASSWORD_HASH='\"+hashPassword(p)+\"'\")"
```

Trong `.env`, đặt `ADMIN_EMAIL=<email quản trị>` và thay dòng `ADMIN_PASSWORD_HASH=` bằng dòng vừa in ra, **giữ nguyên dấu nháy đơn** (bản băm có ký tự `$`).

### 6. Khởi động hệ thống

```bash
docker compose config -q
docker compose up -d --build
docker compose ps
```

Kết quả đúng: 12 container `Up`, trong đó `db`, `app`, `nginx` ở trạng thái `healthy`. MySQL tự chạy các tệp trong `db/init/` ở lần khởi tạo đầu tiên.

### 7. Tường lửa (khuyến nghị)

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

Dừng hệ thống và giữ dữ liệu: `docker compose down`. Không dùng `docker compose down -v` vì lệnh này xóa cả volume dữ liệu.

## Địa chỉ truy cập

Trình duyệt sẽ cảnh báo chứng chỉ tự ký ở lần đầu, chọn tiếp tục truy cập.

| Thành phần | Địa chỉ | Đăng nhập |
|---|---|---|
| Website NEXTECH | `https://192.168.126.134/` | Khách tự đăng ký, hoặc `demo@nextech.vn` / `Nextech@2026` |
| Quản trị NEXTECH | `https://192.168.126.134/admin/login` | `ADMIN_EMAIL` và mật khẩu ở bước 5 |
| phpMyAdmin | `https://192.168.126.134/phpmyadmin/` | Basic Auth (bước 4), sau đó `DBADMIN_USER` / `DBADMIN_PASSWORD` |
| Prometheus | `https://192.168.126.134/prometheus/` | Basic Auth (bước 4) |
| Grafana | `https://192.168.126.134/grafana/` | `GF_ADMIN_USER` / `GF_ADMIN_PASSWORD` |

Truy cập `http://` được chuyển hướng 301 sang `https://`. Các dịch vụ còn lại (MySQL, app, Loki, exporter) chỉ nằm trong mạng Docker nội bộ, không mở cổng ra ngoài.

## Cập nhật hệ thống đang chạy

```bash
git pull origin main
docker compose up -d --build app
```

Các tệp trong `db/init/` chỉ tự chạy khi volume MySQL được tạo lần đầu. Với hệ thống đã có dữ liệu, chạy một lần các tệp được thêm sau:

```bash
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < db/init/03-nextech.sql
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < db/init/04-nextech-products.sql
```

## Chức năng NEXTECH

- **Sản phẩm:** do quản trị thêm trong mục "Sản phẩm & tồn kho", bắt buộc có ảnh (PNG, JPEG, WebP, GIF, tối đa 2 MB). Sản phẩm và ảnh lưu trong bảng `nx_products` (ảnh ở cột `MEDIUMBLOB`), phục vụ qua `/api/nextech/products/<SKU>/image`. Quản trị sửa giá, tồn kho, đổi ảnh, ẩn/hiện và xóa sản phẩm trên máy chủ. Máy chủ kiểm tra cả loại tệp lẫn nội dung ảnh.
- **Đặt hàng:** khách phải đăng nhập mới vào được trang thanh toán. Trình duyệt chỉ gửi SKU, số lượng, địa chỉ và phương thức tới `POST /api/nextech/orders`. Máy chủ tự tính giá, khóa tồn kho bằng `SELECT … FOR UPDATE` (không bán vượt khi nhiều người đặt cùng lúc), lưu vào `nx_orders`, `nx_order_items`, `nx_order_events`. Mã chống tạo trùng ngăn đơn lặp khi bấm nhiều lần. Mã `NEX10` giảm 10%.
- **Thanh toán mô phỏng:** COD, chuyển khoản, VNPAY và MoMo đều là giả lập, không có giao dịch tiền thật. Đơn chờ thanh toán quá hạn (15 phút với ví, 24 giờ với chuyển khoản) được máy chủ tự hủy và trả tồn kho.
- **Quản trị đơn hàng:** chuyển trạng thái (xác nhận → chuẩn bị → giao → hoàn thành), xác nhận chuyển khoản, ghi nhận thu COD, hoàn tiền mô phỏng. Mọi API quản trị (`/api/admin/...`) yêu cầu cookie phiên quản trị.
- **Giám sát nghiệp vụ:** mỗi đơn mới làm tăng `thuongmaidientu_orders_created_total` và `thuongmaidientu_revenue_vnd_total`, hiển thị trên Grafana. Hai bộ đếm này nằm trong bộ nhớ ứng dụng, nên về 0 khi container `app` khởi động lại; dữ liệu đơn hàng vẫn còn nguyên trong MySQL.
- **Log:** ứng dụng ghi log JSON (`http_request`, `order_created`, `nextech_product_created`…), Promtail gắn nhãn `service`, `container`, `level` để truy vấn trên Grafana Explore.

Giới hạn hiện tại: tài khoản khách, giỏ hàng, hồ sơ và địa chỉ vẫn lưu trong LocalStorage của trình duyệt; yêu cầu đăng nhập trước khi đặt hàng mới được kiểm tra ở giao diện.

## Giám sát và log

- Prometheus thu thập 6 job mỗi 15 giây: `prometheus`, `node-exporter`, `cadvisor`, `nginx`, `mysql`, `thuongmaidientu-app`. Xem tại `/prometheus/targets`.
- Grafana tự nạp datasource (Prometheus, Loki) và dashboard 16 panel từ thư mục `grafana/`.
- Một số truy vấn LogQL trong Grafana Explore (datasource Loki):

```
{service="nginx"}
{service="app"} | json | msg="order_created"
{service="app", level=~"warn|error"}
{service=~".+"} |~ "(?i)error|warn|failed"
sum by (service) (count_over_time({project="thuongmaidientu-project"}[5m]))
```

- Route `GET /api/debug/error` tạo lỗi giả để demo log, bị tắt trên production (trả 404). Khi cần demo, đặt `ENABLE_DEBUG_ROUTES=true` trong `.env`, chạy `docker compose up -d app`, demo xong đặt lại `false`.

## Bảo mật

Các biện pháp dưới đây đã được kiểm chứng trên máy ảo; lệnh và kết quả chi tiết ở [docs/hardening.md](docs/hardening.md).

- Container `app` chạy bằng user `node` (UID 1000), Nginx bằng UID 101; `no-new-privileges` cho mọi dịch vụ; `cap_drop: ALL` và hệ thống tệp chỉ đọc cho app, Nginx và các dịch vụ giám sát.
- Ba mạng Docker: `frontend`, `backend` (internal, chứa MySQL), `monitoring` (internal). Chỉ Nginx mở cổng 80/443; UFW chỉ cho phép 22, 80, 443.
- Bí mật nằm trong `.env` (quyền 600), `nginx/.htpasswd` và `nginx/certs/`, đều bị `.gitignore` loại; `app/.dockerignore` không đưa `.env*` vào image.
- MySQL: tài khoản ứng dụng chỉ có `SELECT, INSERT, UPDATE, DELETE` trên database dự án; `root` chỉ đăng nhập từ localhost; `local_infile=0`.
- Nginx: chỉ TLS 1.2/1.3, HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; giới hạn 20 yêu cầu/giây và 50 kết nối mỗi IP; `/metrics` trả 404, tệp ẩn như `/.env` trả 403; Basic Auth cho phpMyAdmin và Prometheus.
- Ứng dụng: mật khẩu quản trị băm scrypt; cookie phiên `HttpOnly`, `Secure`, `SameSite=Strict`, hạn 8 giờ; khóa đăng nhập sau 5 lần sai trong 15 phút (chỉ tin `X-Forwarded-For` khi `TRUST_PROXY` được cấu hình); truy vấn SQL tham số hóa.

## Kiểm thử

```bash
cd app
npm ci
npm test
```

`npm test` kiểm tra logic giỏ hàng, đơn hàng, đăng nhập quản trị và cấu hình máy chủ (không cần MySQL). Muốn chạy thêm nhóm kiểm thử với MySQL thật, khởi tạo một MySQL tạm từ `db/init` rồi chạy `NX_TEST_DB_PORT=<cổng> npm test` (tài khoản mặc định `app`/`apppw`, đổi bằng `NX_TEST_DB_USER`, `NX_TEST_DB_PASSWORD`).

Chạy nhanh không cần Docker (chỉ để xem giao diện): `cd app && npm ci && npm start`, mở `http://localhost:3000/`. Khi không có MySQL, đơn hàng được lưu tạm trong trình duyệt. Tài khoản quản trị local tạo bằng `npm run admin:create` (ghi bản băm vào `app/.env.local`, đã bị Git bỏ qua).

## Cấu trúc thư mục

- `app/`: mã nguồn website (`server.js`, `nextech-orders.cjs`, `admin-auth.cjs`), giao diện trong `public/`, kiểm thử trong `test/`, Dockerfile.
- `db/init/`: tạo bảng và tài khoản MySQL (`01-schema.sql`, `02-users.sh`, `03-nextech.sql`, `04-nextech-products.sql`).
- `nginx/`: cấu hình reverse proxy; `certs/` chứa chứng chỉ (tạo ở bước 3).
- `prometheus/`, `grafana/`: cấu hình giám sát, luật cảnh báo, dashboard.
- `loki/`, `promtail/`: cấu hình thu thập log.
- `docs/`: ghi nhận kiểm chứng bảo mật và thư mục ảnh minh chứng.
