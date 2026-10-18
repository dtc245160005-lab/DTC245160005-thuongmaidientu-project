-- Cau truc CSDL va du lieu mau cho website thuong mai dien tu
SET NAMES utf8mb4;

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(12,0) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  emoji VARCHAR(16) DEFAULT '🛍️',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT chk_price CHECK (price >= 0),
  CONSTRAINT chk_stock CHECK (stock >= 0)
) ENGINE=InnoDB;

CREATE TABLE cart_items (
  cart_token CHAR(36) NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_token, product_id),
  CONSTRAINT fk_cart_prod FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT chk_qty CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cart_token CHAR(36) NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address VARCHAR(255) NOT NULL,
  total DECIMAL(14,0) NOT NULL,
  status ENUM('pending', 'confirmed', 'shipping', 'completed', 'cancelled')
    NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_token (cart_token)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  unit_price DECIMAL(12,0) NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_prod FOREIGN KEY (product_id)
    REFERENCES products(id)
) ENGINE=InnoDB;

INSERT INTO categories (name) VALUES
  ('Điện tử'),
  ('Thời trang'),
  ('Gia dụng'),
  ('Sách'),
  ('Phụ kiện');

INSERT INTO products (category_id, name, description, price, stock, emoji) VALUES
  (1, 'Tai nghe Bluetooth', 'Tai nghe không dây, hộp sạc tiện lợi', 350000, 30, '🎧'),
  (1, 'Chuột máy tính không dây', 'Kết nối USB, thiết kế gọn nhẹ', 180000, 45, '🖱️'),
  (1, 'Bàn phím cơ', 'Bàn phím có đèn nền', 650000, 20, '⌨️'),
  (2, 'Áo thun nam', 'Chất liệu cotton thoáng mát', 150000, 60, '👕'),
  (2, 'Áo khoác nữ', 'Thiết kế đơn giản, dễ phối đồ', 390000, 25, '🧥'),
  (2, 'Giày thể thao', 'Đế êm, phù hợp đi hằng ngày', 520000, 35, '👟'),
  (3, 'Bình giữ nhiệt', 'Dung tích 500 ml, giữ nóng và lạnh', 210000, 50, '🥤'),
  (3, 'Đèn bàn học', 'Đèn LED có thể điều chỉnh độ sáng', 290000, 30, '💡'),
  (4, 'Sách kỹ năng giao tiếp', 'Sách tham khảo về giao tiếp', 95000, 40, '📚'),
  (4, 'Sổ tay ghi chép', 'Sổ bìa cứng 120 trang', 45000, 70, '📓'),
  (5, 'Ba lô laptop', 'Ngăn chống sốc cho laptop', 320000, 30, '🎒'),
  (5, 'Cáp sạc USB-C', 'Cáp dài 1 mét', 85000, 80, '🔌');
