-- Bang luu don hang NEXTECH tren may chu.
-- Gia ban va ma giam gia lay tu ma nguon (commerce-data.mjs); ton kho lay tu nx_inventory.
-- Ung dung tu chen dong ton kho con thieu khi khoi dong (INSERT IGNORE).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS nx_inventory (
  sku VARCHAR(32) PRIMARY KEY,
  on_hand INT NOT NULL,
  reserved INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_nx_on_hand CHECK (on_hand >= 0),
  CONSTRAINT chk_nx_reserved CHECK (reserved >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nx_orders (
  id VARCHAR(40) PRIMARY KEY,
  idempotency_key VARCHAR(64) NOT NULL UNIQUE,
  access_token_hash CHAR(64) NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  province VARCHAR(100) NOT NULL,
  ward VARCHAR(100) NOT NULL,
  address_detail VARCHAR(255) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  delivery ENUM('HOME', 'STORE') NOT NULL,
  payment_method ENUM('COD', 'BANK_DEMO', 'VNPAY_DEMO', 'MOMO_DEMO') NOT NULL,
  payment_status ENUM('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED') NOT NULL,
  status ENUM('PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'SHIPPING', 'DELIVERED',
              'COMPLETED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED') NOT NULL,
  reservation ENUM('RESERVED', 'RELEASED', 'CONSUMED') NOT NULL DEFAULT 'RESERVED',
  subtotal DECIMAL(14,0) NOT NULL,
  discount DECIMAL(14,0) NOT NULL,
  shipping DECIMAL(14,0) NOT NULL,
  total DECIMAL(14,0) NOT NULL,
  coupon VARCHAR(32) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_nx_orders_pending (payment_status, status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nx_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(40) NOT NULL,
  sku VARCHAR(32) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  variant_label VARCHAR(100) NOT NULL,
  unit_price DECIMAL(12,0) NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT fk_nx_items_order FOREIGN KEY (order_id) REFERENCES nx_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_nx_items_sku FOREIGN KEY (sku) REFERENCES nx_inventory(sku),
  CONSTRAINT chk_nx_qty CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nx_order_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(40) NOT NULL,
  status VARCHAR(32) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_nx_events_order FOREIGN KEY (order_id) REFERENCES nx_orders(id) ON DELETE CASCADE,
  INDEX idx_nx_events_order (order_id)
) ENGINE=InnoDB;
