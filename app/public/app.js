'use strict';

const $ = selector => document.querySelector(selector);
const money = value => Number(value).toLocaleString('vi-VN') + ' ₫';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function uuid() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0;
    return (char === 'x' ? random : (random & 3 | 8)).toString(16);
  });
}

function cartToken() {
  let token = localStorage.getItem('cartToken');
  if (!token) {
    token = uuid();
    localStorage.setItem('cartToken', token);
  }
  return token;
}

const TOKEN = cartToken();

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Có lỗi xảy ra');
  }
  return data;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.remove('hidden');
  setTimeout(() => element.classList.add('hidden'), 2500);
}

async function loadCategories() {
  const categories = await api('/api/categories');

  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    $('#category').append(option);
  }
}

async function loadProducts() {
  const params = new URLSearchParams();
  if ($('#category').value) {
    params.set('category', $('#category').value);
  }
  if ($('#search').value.trim()) {
    params.set('q', $('#search').value.trim());
  }

  const products = await api('/api/products?' + params.toString());
  $('#product-list').innerHTML = products.map(product => `
    <div class="card product">
      <div class="emoji">${esc(product.emoji)}</div>
      <h3>${esc(product.name)}</h3>
      <p class="muted">${esc(product.category)}</p>
      <p>${esc(product.description)}</p>
      <p class="price">${money(product.price)}</p>
      <p class="muted">Còn ${Number(product.stock)} sản phẩm</p>
      <button type="button" class="primary add"
              data-id="${Number(product.id)}"
              ${product.stock < 1 ? 'disabled' : ''}>
        Thêm vào giỏ
      </button>
    </div>
  `).join('') || '<p>Không có sản phẩm phù hợp.</p>';
}

function renderCart(cart) {
  $('#cart-count').textContent = cart.items.reduce(
    (sum, item) => sum + Number(item.quantity), 0
  );
  $('#cart-total').textContent = money(cart.total);

  $('#cart-items').innerHTML = cart.items.length
    ? cart.items.map(item => `
      <div class="cart-row">
        <span>${esc(item.emoji)}</span>
        <span class="name">
          ${esc(item.name)}<br>
          <span class="muted">${money(item.price)}</span>
        </span>
        <span class="qty">
          <button type="button" data-act="dec"
                  data-id="${Number(item.product_id)}"
                  data-q="${Number(item.quantity)}">−</button>
          ${Number(item.quantity)}
          <button type="button" data-act="inc"
                  data-id="${Number(item.product_id)}"
                  data-q="${Number(item.quantity)}">+</button>
        </span>
        <strong>${money(item.subtotal)}</strong>
        <button type="button" data-act="del"
                data-id="${Number(item.product_id)}">Xóa</button>
      </div>
    `).join('')
    : '<p>Giỏ hàng đang trống.</p>';
}

async function refreshCart() {
  renderCart(await api(`/api/cart/${TOKEN}`));
}

async function loadOrders() {
  const orders = await api(`/api/orders?cartToken=${TOKEN}`);

  $('#order-list').innerHTML = orders.length
    ? orders.map(order => `
      <div class="card order">
        <strong>Đơn #${Number(order.id)}</strong>
        <span class="badge">${esc(order.status)}</span>
        <p class="muted">
          ${new Date(order.created_at).toLocaleString('vi-VN')} –
          ${esc(order.customer_name)}, ${esc(order.phone)}
        </p>
        <p class="muted">${esc(order.address)}</p>
        <ul>
          ${order.items.map(item => `
            <li>${esc(item.product_name)} × ${Number(item.quantity)}</li>
          `).join('')}
        </ul>
        <p class="price">${money(order.total)}</p>
      </div>
    `).join('')
    : '<p>Bạn chưa có đơn hàng nào.</p>';
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab === button);
    });
    document.querySelectorAll('.view').forEach(view => {
      view.classList.add('hidden');
    });

    $('#view-' + button.dataset.view).classList.remove('hidden');

    if (button.dataset.view === 'cart') {
      refreshCart().catch(error => toast(error.message));
    }
    if (button.dataset.view === 'orders') {
      loadOrders().catch(error => toast(error.message));
    }
  });
});

$('#category').addEventListener('change', () => {
  loadProducts().catch(error => toast(error.message));
});

let searchTimer;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadProducts().catch(error => toast(error.message));
  }, 300);
});

$('#product-list').addEventListener('click', async event => {
  const button = event.target.closest('button.add');
  if (!button) return;

  try {
    renderCart(await api(`/api/cart/${TOKEN}/items`, {
      method: 'POST',
      body: JSON.stringify({
        productId: Number(button.dataset.id),
        quantity: 1
      })
    }));
    toast('Đã thêm vào giỏ hàng');
  } catch (error) {
    toast(error.message);
  }
});

$('#cart-items').addEventListener('click', async event => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;

  const id = Number(button.dataset.id);
  const currentQuantity = Number(button.dataset.q || 0);

  try {
    if (button.dataset.act === 'del') {
      renderCart(await api(`/api/cart/${TOKEN}/items/${id}`, {
        method: 'DELETE'
      }));
    } else {
      const quantity = button.dataset.act === 'inc'
        ? currentQuantity + 1
        : currentQuantity - 1;

      renderCart(await api(`/api/cart/${TOKEN}/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity })
      }));
    }
  } catch (error) {
    toast(error.message);
  }
});

$('#checkout-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    const order = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        cartToken: TOKEN,
        customerName: form.get('customerName'),
        phone: form.get('phone'),
        address: form.get('address')
      })
    });

    toast(`Đặt hàng thành công! Mã đơn #${order.orderId}`);
    event.target.reset();
    await refreshCart();
    await loadProducts();
  } catch (error) {
    toast(error.message);
  }
});

(async () => {
  try {
    await loadCategories();
    await loadProducts();
    await refreshCart();
  } catch (error) {
    toast(error.message);
  }
})();
