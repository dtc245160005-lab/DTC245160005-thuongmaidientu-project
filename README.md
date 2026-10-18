# Website thương mại điện tử - Đề 9

Sinh viên: **Ma Đình Tuyển**
MSSV: **DTC245160005**

## Giới thiệu

Website bán hàng trực tuyến có chức năng quản lý sản phẩm, giỏ hàng và đơn hàng. Dữ liệu được lưu trong MySQL. Hệ thống được triển khai bằng Docker Compose trên máy ảo Ubuntu.

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
