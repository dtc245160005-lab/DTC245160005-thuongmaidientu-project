-- Sản phẩm NEXTECH do quản trị thêm (kèm ảnh tải lên). Sản phẩm có sẵn vẫn nằm trong commerce-data.mjs.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS nx_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL UNIQUE,
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  price DECIMAL(12,0) NOT NULL,
  old_price DECIMAL(12,0) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  image MEDIUMBLOB NULL,
  image_type VARCHAR(32) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_nx_products_sku FOREIGN KEY (sku) REFERENCES nx_inventory(sku),
  CONSTRAINT chk_nx_products_price CHECK (price >= 0)
) ENGINE=InnoDB;
