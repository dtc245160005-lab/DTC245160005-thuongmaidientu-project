#!/bin/bash
set -e

# Chi chay khi MySQL khoi tao volume du lieu lan dau.
mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL
-- Tai khoan ung dung: chi duoc doc va thay doi du lieu.
CREATE USER IF NOT EXISTS '${APP_DB_USER}'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${APP_DB_USER}'@'%';

-- Tai khoan phpMyAdmin: quan tri CSDL cua du an.
CREATE USER IF NOT EXISTS '${DBADMIN_USER}'@'%' IDENTIFIED BY '${DBADMIN_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${DBADMIN_USER}'@'%';

-- Tai khoan thu thap chi so MySQL.
CREATE USER IF NOT EXISTS 'exporter'@'%' IDENTIFIED BY '${EXPORTER_DB_PASSWORD}' WITH MAX_USER_CONNECTIONS 3;
GRANT PROCESS, REPLICATION CLIENT ON *.* TO 'exporter'@'%';
GRANT SELECT ON performance_schema.* TO 'exporter'@'%';

FLUSH PRIVILEGES;
EOSQL

echo "[init] Da tao cac tai khoan MySQL"
