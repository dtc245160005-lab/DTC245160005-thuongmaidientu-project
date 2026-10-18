# Kiểm chứng bảo mật hệ thống thương mại điện tử

Sinh viên: Ma Đình Tuyển – DTC245160005
Máy triển khai: 192.168.126.134

## 1. Container không chạy root

- `docker compose exec -T app id`: `uid=1000(node)`.
- `docker compose exec -T nginx id`: `uid=101(nginx)`.

## 2. Cô lập mạng và cổng

- `thuongmaidientu_backend` và `thuongmaidientu_monitoring`: `internal=true`.
- Nginx không tham gia mạng backend chứa MySQL.
- Dự án chỉ công bố cổng 80 và 443 qua Nginx.
- Trên VM, `ss -ltnp` cho thấy cổng lắng nghe từ bên ngoài là 22, 80 và 443.
- Các container thuộc bài thực hành cũ có cổng công bố đã được dừng, không xóa dữ liệu.

## 3. Bảo vệ file bí mật

- `.env`: quyền `600`.
- `nginx/certs/server.key`: quyền `600`, UID/GID `101:101`.
- `nginx/.htpasswd`: quyền `640`, UID/GID `1000:101`; Nginx vẫn trả `401` khi chưa xác thực.
- `.env`, `.htpasswd`, khóa và chứng chỉ HTTPS bị `.gitignore` loại trừ, không được Git theo dõi.
- Sau khi tạo lại `.htpasswd`, đặt quyền bằng `sudo chgrp 101 nginx/.htpasswd` và `chmod 640 nginx/.htpasswd`.

## 4. Quyền MySQL

- `root` chỉ được kết nối từ `localhost`.
- Tài khoản ứng dụng chỉ có `SELECT, INSERT, UPDATE, DELETE` trên database `thuongmaidientu`.
- Tài khoản quản trị có quyền trên database `thuongmaidientu`, không có quyền toàn cục.
- `exporter` có `PROCESS`, `REPLICATION CLIENT` và `SELECT` trên `performance_schema`.
- `local_infile=OFF`.

## 5. HTTPS và bảo vệ truy cập

- TLS 1.1 bị từ chối với `alert protocol version`.
- Có HSTS, CSP, X-Frame-Options, X-Content-Type-Options và Referrer-Policy.
- phpMyAdmin và Prometheus trả `401` khi chưa xác thực.
- `/metrics` trả `404`; `/.env` trả `403`.
- Thử 80 yêu cầu đọc sản phẩm cùng lúc: 50 phản hồi `200`, 30 phản hồi `503` do giới hạn tốc độ.

## 6. Giới hạn container và máy chủ

- App và Nginx có `ReadonlyRootfs=true`, `CapDrop=ALL`, `no-new-privileges=true`.
- App giới hạn 256 MiB RAM; Nginx giới hạn 128 MiB RAM.
- Thử tạo `/app/hack.txt` bị từ chối: `Read-only file system`.
- UFW đang bật, cho phép OpenSSH, 80/tcp và 443/tcp.
- Log Docker dùng `json-file`, giới hạn `max-size=10m`, `max-file=3`.
