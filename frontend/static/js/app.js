/* ═══════════════════════════════════════════
   FERREMAS – Lógica principal del frontend
   ═══════════════════════════════════════════ */

const API = "http://localhost:8000/api";
let token = localStorage.getItem("token");
let userInfo = JSON.parse(localStorage.getItem("userInfo") || "null");
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

// ─── UTILIDADES ────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${API}${path}`, { ...options, headers });
  if (resp.status === 401) { logout(); return null; }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.detail || "Error en el servidor");
  return data;
}

function showAlert(msg, type = "info", containerId = "global-alert") {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  if (containerId === "global-alert") setTimeout(() => el.innerHTML = "", 5000);
}

function formatCLP(amount) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(amount);
}

function badgeEstado(estado) {
  const map = {
    pendiente: "badge-pending", aprobado: "badge-approved",
    rechazado: "badge-rejected", preparando: "badge-preparing",
    listo: "badge-ready", entregado: "badge-delivered",
    confirmado: "badge-approved",
  };
  return `<span class="badge ${map[estado] || ''}">${estado}</span>`;
}

// ─── NAVEGACIÓN ────────────────────────────────────────────────────────────

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const page = document.getElementById(pageId);
  if (page) page.classList.add("active");
  updateNavbar();
}

function updateNavbar() {
  const navUser  = document.getElementById("nav-user-info");
  const navLogin = document.getElementById("nav-login");
  const navLogout= document.getElementById("nav-logout");
  const navAdmin = document.getElementById("nav-admin");

  if (userInfo) {
    navUser.textContent = `👤 ${userInfo.nombre} (${userInfo.rol})`;
    navLogin.style.display  = "none";
    navLogout.style.display = "inline";
    navAdmin.style.display  = userInfo.rol !== "cliente" ? "inline" : "none";
  } else {
    navUser.textContent     = "";
    navLogin.style.display  = "inline";
    navLogout.style.display = "none";
    navAdmin.style.display  = "none";
  }
  updateCartBadge();
}

function updateCartBadge() {
  const total = cart.reduce((s, i) => s + i.cantidad, 0);
  document.getElementById("cart-count").textContent = total > 0 ? `🛒 ${total}` : "🛒 Carrito";
}

// ─── AUTH ───────────────────────────────────────────────────────────────────

async function login() {
  const email    = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    const data = await apiFetch("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password })
    });
    token    = data.access_token;
    userInfo = { nombre: data.nombre, rol: data.rol, primer_login: data.primer_login };
    localStorage.setItem("token",    token);
    localStorage.setItem("userInfo", JSON.stringify(userInfo));
    if (data.primer_login) {
      showPage("page-change-password");
      showAlert("⚠️ Debes cambiar tu contraseña antes de continuar.", "info", "change-pwd-alert");
    } else {
      redirectByRole();
    }
  } catch (e) { showAlert(e.message, "error", "login-alert"); }
}

async function register() {
  const nombre   = document.getElementById("reg-nombre").value;
  const email    = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;
  const suscrito = document.getElementById("reg-suscrito").checked;
  try {
    await apiFetch("/auth/registro", {
      method: "POST", body: JSON.stringify({ nombre, email, password, suscrito_noticias: suscrito })
    });
    showAlert("✅ Registro exitoso. Inicia sesión.", "success", "register-alert");
    setTimeout(() => showPage("page-login"), 1500);
  } catch (e) { showAlert(e.message, "error", "register-alert"); }
}

async function changePassword() {
  const newPwd = document.getElementById("new-password").value;
  if (newPwd.length < 6) { showAlert("Mínimo 6 caracteres", "error", "change-pwd-alert"); return; }
  try {
    await apiFetch("/auth/cambiar-password", {
      method: "PUT", body: JSON.stringify({ password: newPwd })
    });
    userInfo.primer_login = false;
    localStorage.setItem("userInfo", JSON.stringify(userInfo));
    showAlert("✅ Contraseña actualizada", "success", "change-pwd-alert");
    setTimeout(() => redirectByRole(), 1000);
  } catch (e) { showAlert(e.message, "error", "change-pwd-alert"); }
}

function logout() {
  token = null; userInfo = null; cart = [];
  localStorage.removeItem("token");
  localStorage.removeItem("userInfo");
  localStorage.removeItem("cart");
  showPage("page-home");
}

function redirectByRole() {
  if (!userInfo) return showPage("page-home");
  const pages = {
    cliente: "page-catalog", vendedor: "page-vendedor",
    bodeguero: "page-bodeguero", contador: "page-contador",
    administrador: "page-admin",
  };
  showPage(pages[userInfo.rol] || "page-home");
  if (userInfo.rol === "cliente")       loadCatalog();
  if (userInfo.rol === "vendedor")      loadPedidosVendedor();
  if (userInfo.rol === "bodeguero")     loadPedidosBodeguero();
  if (userInfo.rol === "contador")      loadPedidosContador();
  if (userInfo.rol === "administrador") loadAdmin();
}

// ─── CATÁLOGO ───────────────────────────────────────────────────────────────

async function loadCatalog() {
  const busqueda = document.getElementById("search-input")?.value || "";
  const catId    = document.getElementById("cat-filter")?.value || "";
  let url = "/productos?";
  if (busqueda) url += `busqueda=${encodeURIComponent(busqueda)}&`;
  if (catId)    url += `categoria_id=${catId}&`;

  const grid = document.getElementById("product-grid");
  grid.innerHTML = `<div style="padding:2rem"><div class="spinner"></div></div>`;
  try {
    const productos = await apiFetch(url);
    grid.innerHTML = productos.length === 0
      ? "<p style='padding:1rem'>No se encontraron productos.</p>"
      : productos.map(renderProductCard).join("");
  } catch { grid.innerHTML = "<p style='padding:1rem;color:red'>Error cargando productos.</p>"; }
}

function renderProductCard(p) {
  const iconMap = {
    "Herramientas Manuales": "🔨", "Herramientas Eléctricas": "⚡",
    "Materiales de Construcción": "🏗️", "Equipos de Seguridad": "🦺",
    "Tornillos y Anclajes": "🔩", "Equipos de Medición": "📏"
  };
  const icon = iconMap[p.categoria?.nombre] || "📦";
  return `
    <div class="product-card">
      <div class="product-img">${icon}</div>
      <div class="product-info">
        <div class="product-name">${p.nombre}</div>
        <div class="product-brand">${p.marca} · ${p.categoria?.nombre}</div>
        <div class="product-price">${formatCLP(p.precio)}</div>
        <div class="product-stock">Stock: ${p.stock} unidades</div>
      </div>
      <div class="product-actions">
        <button class="btn btn-primary" style="width:100%"
          onclick="addToCart(${p.id},'${p.nombre.replace(/'/g,"\\'")}',${p.precio})">
          + Agregar al carrito
        </button>
      </div>
    </div>`;
}

async function loadCategories() {
  try {
    const cats = await apiFetch("/productos/categorias");
    const sel  = document.getElementById("cat-filter");
    if (!sel) return;
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id; opt.textContent = c.nombre;
      sel.appendChild(opt);
    });
  } catch {}
}

// ─── CARRITO ────────────────────────────────────────────────────────────────

function addToCart(id, nombre, precio) {
  const existing = cart.find(i => i.id === id);
  if (existing) existing.cantidad++;
  else cart.push({ id, nombre, precio, cantidad: 1 });
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartBadge();
  showAlert(`✅ <strong>${nombre}</strong> agregado al carrito`, "success");
}

function renderCart() {
  const container = document.getElementById("cart-items");
  const totalEl   = document.getElementById("cart-total");
  if (!container) return;
  if (cart.length === 0) {
    container.innerHTML = "<p style='padding:1rem;color:#888'>Tu carrito está vacío.</p>";
    totalEl.textContent = ""; return;
  }
  let total = 0;
  container.innerHTML = cart.map(item => {
    total += item.precio * item.cantidad;
    return `
      <div class="cart-item">
        <span class="item-name">${item.nombre}</span>
        <div class="item-qty">
          <button class="btn btn-sm btn-outline" onclick="changeQty(${item.id},-1)">−</button>
          <span>${item.cantidad}</span>
          <button class="btn btn-sm btn-outline" onclick="changeQty(${item.id},1)">+</button>
        </div>
        <span class="item-price">${formatCLP(item.precio * item.cantidad)}</span>
        <button class="btn btn-sm btn-danger" onclick="removeFromCart(${item.id})">✕</button>
      </div>`;
  }).join("");
  totalEl.innerHTML = `<div class="cart-total">Total: ${formatCLP(total)}</div>`;
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) removeFromCart(id);
  else { localStorage.setItem("cart", JSON.stringify(cart)); renderCart(); updateCartBadge(); }
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart(); updateCartBadge();
}

// ─── CHECKOUT ───────────────────────────────────────────────────────────────

async function checkout() {
  if (!userInfo || userInfo.rol !== "cliente") {
    showPage("page-login"); return;
  }
  if (cart.length === 0) {
    showAlert("El carrito está vacío", "error", "cart-alert"); return;
  }

  const tipoEntrega = document.getElementById("tipo-entrega").value;
  const metodoPago  = document.getElementById("metodo-pago").value;
  const direccion   = document.getElementById("direccion-entrega").value;
  const items       = cart.map(i => ({ producto_id: i.id, cantidad: i.cantidad }));

  // Validación dirección despacho
  if (tipoEntrega === "despacho_domicilio" && !direccion.trim()) {
    showAlert("Debes ingresar una dirección de entrega para despacho a domicilio.", "error", "cart-alert");
    return;
  }

  const btnCheckout = document.getElementById("btn-checkout");
  btnCheckout.disabled = true;
  btnCheckout.innerHTML = `<span class="spinner"></span> Procesando...`;

  try {
    const pedido = await apiFetch("/pedidos", {
      method: "POST",
      body: JSON.stringify({ tipo_entrega: tipoEntrega, metodo_pago: metodoPago, direccion_entrega: direccion, items })
    });

    // Limpiar carrito
    cart = []; localStorage.removeItem("cart"); updateCartBadge(); renderCart();

    if (metodoPago === "transferencia") {
      // Mostrar modal con datos bancarios y formulario de transferencia
      abrirModalTransferencia(pedido.id, pedido.total);
    } else {
      // Webpay: iniciar transacción y redirigir
      showAlert(`✅ Pedido #${pedido.id} creado. Redirigiendo a Webpay...`, "success", "cart-alert");
      const wp = await apiFetch(`/pagos/webpay/iniciar/${pedido.id}`, { method: "POST" });
      if (wp?.url_pago) {
        // Webpay requiere un formulario POST, no un GET redirect
        enviarFormularioWebpay(wp.url_pago, wp.token);
      }
    }
  } catch (e) {
    showAlert(e.message, "error", "cart-alert");
  } finally {
    btnCheckout.disabled = false;
    btnCheckout.innerHTML = "Realizar pedido →";
  }
}

// Webpay exige POST con el token (no GET) para llegar a su página de pago
function enviarFormularioWebpay(url, token) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  const input = document.createElement("input");
  input.type  = "hidden";
  input.name  = "token_ws";
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

// ─── MODAL TRANSFERENCIA ─────────────────────────────────────────────────────

async function abrirModalTransferencia(pedidoId, total) {
  // Obtener datos bancarios desde la API
  let datosBanco = {};
  try {
    datosBanco = await apiFetch("/pagos/transferencia/datos-banco");
  } catch {}

  const modal = document.getElementById("modal-transferencia");
  document.getElementById("modal-pedido-id").textContent  = pedidoId;
  document.getElementById("modal-monto").textContent       = formatCLP(total);
  document.getElementById("modal-banco").textContent       = datosBanco.banco || "Banco de Chile";
  document.getElementById("modal-cuenta").textContent      = datosBanco.numero_cuenta || "00-123-45678-09";
  document.getElementById("modal-rut-emp").textContent     = datosBanco.rut_empresa || "76.543.210-K";
  document.getElementById("modal-nombre-emp").textContent  = datosBanco.nombre_empresa || "FERREMAS Ltda.";
  document.getElementById("modal-email-banco").textContent = datosBanco.email_comprobante || "pagos@ferremas.cl";

  // Guardar pedido id para el submit
  document.getElementById("form-transferencia").dataset.pedidoId = pedidoId;
  document.getElementById("form-transferencia").dataset.total    = total;

  modal.style.display = "flex";
}

function cerrarModalTransferencia() {
  document.getElementById("modal-transferencia").style.display = "none";
  // limpiar campos
  ["transf-nombre","transf-rut","transf-banco","transf-comprobante","transf-email"].forEach(
    id => { const el = document.getElementById(id); if (el) el.value = ""; }
  );
  document.getElementById("transf-alert").innerHTML = "";
}

async function enviarDatosTransferencia() {
  const form       = document.getElementById("form-transferencia");
  const pedidoId   = parseInt(form.dataset.pedidoId);
  const nombre     = document.getElementById("transf-nombre").value.trim();
  const rut        = document.getElementById("transf-rut").value.trim();
  const banco      = document.getElementById("transf-banco").value.trim();
  const comprobante= document.getElementById("transf-comprobante").value.trim();
  const email      = document.getElementById("transf-email").value.trim();

  if (!nombre || !rut || !banco || !comprobante || !email) {
    showAlert("Por favor completa todos los campos.", "error", "transf-alert"); return;
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    showAlert("Ingresa un email válido.", "error", "transf-alert"); return;
  }

  const btn = document.getElementById("btn-enviar-transf");
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Enviando...`;

  try {
    await apiFetch("/pagos/transferencia/registrar", {
      method: "POST",
      body: JSON.stringify({
        pedido_id: pedidoId,
        nombre_titular: nombre,
        rut_titular: rut,
        banco_origen: banco,
        numero_comprobante: comprobante,
        email_notificacion: email,
      })
    });
    cerrarModalTransferencia();
    showAlert(
      `✅ ¡Transferencia registrada! El contador verificará tu pago y actualizará el estado del pedido #${pedidoId}.`,
      "success"
    );
    showPage("page-catalog");
  } catch (e) {
    showAlert(e.message, "error", "transf-alert");
  } finally {
    btn.disabled = false; btn.innerHTML = "Confirmar transferencia";
  }
}

// Detectar retorno de Webpay por query param
function checkWebpayReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pago") === "ok") {
    showAlert("✅ ¡Pago con Webpay aprobado! Tu pedido está confirmado.", "success");
    history.replaceState({}, "", "/");
    showPage("page-catalog"); loadCatalog();
  } else if (params.get("pago") === "error") {
    showAlert("❌ El pago fue rechazado por Webpay. Intenta nuevamente.", "error");
    history.replaceState({}, "", "/");
  }
}

// ─── CONVERSIÓN DE DIVISAS ──────────────────────────────────────────────────

async function convertirDivisa() {
  const monto  = document.getElementById("divisa-monto").value;
  const moneda = document.getElementById("divisa-moneda").value;
  const resultEl = document.getElementById("divisa-result");
  resultEl.innerHTML = `<span class="spinner"></span>`;
  try {
    const data = await apiFetch(`/divisas/convertir?monto=${monto}&moneda=${moneda}`);
    resultEl.innerHTML = `
      <div class="currency-result">${formatCLP(data.monto_convertido)}</div>
      <small>1 ${data.moneda_origen} = ${formatCLP(data.valor_unitario)} CLP (${data.fecha})</small>`;
  } catch (e) { resultEl.innerHTML = `<span style="color:#ff6b6b">${e.message}</span>`; }
}

// ─── CONTACTO ───────────────────────────────────────────────────────────────

async function enviarContacto() {
  const body = {
    nombre:  document.getElementById("contact-nombre").value,
    email:   document.getElementById("contact-email").value,
    asunto:  document.getElementById("contact-asunto").value,
    mensaje: document.getElementById("contact-mensaje").value,
  };
  try {
    await apiFetch("/contacto", { method: "POST", body: JSON.stringify(body) });
    showAlert("✅ Mensaje enviado. Un vendedor te contactará pronto.", "success", "contact-alert");
    ["contact-nombre","contact-email","contact-asunto","contact-mensaje"]
      .forEach(id => document.getElementById(id).value = "");
  } catch (e) { showAlert(e.message, "error", "contact-alert"); }
}

// ─── VISTA VENDEDOR ─────────────────────────────────────────────────────────

async function loadPedidosVendedor() {
  const tbody = document.getElementById("vendedor-pedidos-body");
  if (!tbody) return;
  try {
    const pedidos = await apiFetch("/pedidos/todos");
    const filtrados = pedidos.filter(p => ["pendiente","aprobado"].includes(p.estado));
    tbody.innerHTML = filtrados.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td>${new Date(p.fecha_creacion).toLocaleDateString("es-CL")}</td>
        <td>${badgeEstado(p.estado)}</td>
        <td>${p.tipo_entrega.replace("_"," ")}</td>
        <td>${badgeEstado(p.estado_pago)}</td>
        <td>${formatCLP(p.total)}</td>
        <td>
          ${p.estado === "pendiente" ? `
            <button class="btn btn-sm btn-success" onclick="accionPedido(${p.id},'aprobar')">✅ Aprobar</button>
            <button class="btn btn-sm btn-danger" onclick="accionPedido(${p.id},'rechazar')">❌ Rechazar</button>` : "—"}
        </td>
      </tr>`).join("") || "<tr><td colspan='7' style='padding:1rem;color:#888'>Sin pedidos pendientes</td></tr>";
  } catch {}
}

async function accionPedido(id, accion) {
  try {
    await apiFetch(`/pedidos/${id}/${accion}`, { method: "PUT" });
    showAlert(`Pedido #${id} ${accion === "aprobar" ? "aprobado ✅" : "rechazado ❌"}`, "success");
    loadPedidosVendedor();
  } catch (e) { showAlert(e.message, "error"); }
}

// ─── VISTA BODEGUERO ─────────────────────────────────────────────────────────

async function loadPedidosBodeguero() {
  const tbody = document.getElementById("bodeguero-pedidos-body");
  if (!tbody) return;
  try {
    const pedidos = await apiFetch("/pedidos/todos");
    const filtrados = pedidos.filter(p => ["aprobado","preparando"].includes(p.estado));
    tbody.innerHTML = filtrados.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td>${badgeEstado(p.estado)}</td>
        <td>${p.items.map(i => `${i.producto.nombre} ×${i.cantidad}`).join(", ")}</td>
        <td>
          ${p.estado === "aprobado"   ? `<button class="btn btn-sm btn-primary" onclick="accionBodega(${p.id},'preparar')">🔄 Preparar</button>` : ""}
          ${p.estado === "preparando" ? `<button class="btn btn-sm btn-success" onclick="accionBodega(${p.id},'listo')">✅ Listo</button>` : ""}
        </td>
      </tr>`).join("") || "<tr><td colspan='4' style='padding:1rem;color:#888'>Sin pedidos asignados</td></tr>";
  } catch {}
}

async function accionBodega(id, accion) {
  try {
    await apiFetch(`/pedidos/${id}/${accion}`, { method: "PUT" });
    showAlert(`Pedido #${id}: ${accion === "preparar" ? "en preparación 🔄" : "listo ✅"}`, "success");
    loadPedidosBodeguero();
  } catch (e) { showAlert(e.message, "error"); }
}

// ─── VISTA CONTADOR ──────────────────────────────────────────────────────────

async function loadPedidosContador() {
  const tbody = document.getElementById("contador-pedidos-body");
  if (!tbody) return;
  try {
    const pedidos = await apiFetch("/pedidos/todos");
    tbody.innerHTML = pedidos.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td>${p.metodo_pago}</td>
        <td>${badgeEstado(p.estado_pago)}</td>
        <td>${formatCLP(p.total)}</td>
        <td>${badgeEstado(p.estado)}</td>
        <td>
          ${p.metodo_pago === "transferencia" && p.estado_pago === "pendiente" ? `
            <div style="display:flex;gap:.4rem;align-items:center">
              <input id="comp-${p.id}" placeholder="N° comprobante"
                style="padding:4px 8px;border-radius:4px;border:1px solid #ccc;font-size:.82rem">
              <button class="btn btn-sm btn-success" onclick="confirmarTransferencia(${p.id})">Confirmar</button>
            </div>` : ""}
          ${p.estado === "listo" ? `<button class="btn btn-sm btn-primary" onclick="registrarEntrega(${p.id})">📦 Registrar entrega</button>` : ""}
          ${p.estado_pago === "confirmado" && p.estado !== "listo" && p.estado !== "entregado" ? `<span style="color:#888;font-size:.8rem">Sin acciones</span>` : ""}
        </td>
      </tr>`).join("") || "<tr><td colspan='6' style='padding:1rem;color:#888'>Sin datos</td></tr>";
  } catch {}
}

async function confirmarTransferencia(pedidoId) {
  const comprobante = document.getElementById(`comp-${pedidoId}`)?.value?.trim();
  if (!comprobante) { showAlert("Ingresa el número de comprobante", "error"); return; }
  try {
    await apiFetch("/pagos/transferencia/confirmar", {
      method: "POST", body: JSON.stringify({ pedido_id: pedidoId, comprobante })
    });
    showAlert("✅ Transferencia confirmada", "success"); loadPedidosContador();
  } catch (e) { showAlert(e.message, "error"); }
}

async function registrarEntrega(pedidoId) {
  try {
    await apiFetch(`/pedidos/${pedidoId}/entregar`, { method: "PUT" });
    showAlert(`✅ Entrega del pedido #${pedidoId} registrada`, "success");
    loadPedidosContador();
  } catch (e) { showAlert(e.message, "error"); }
}

// ─── VISTA ADMIN ─────────────────────────────────────────────────────────────

async function loadAdmin() {
  try {
    const reporte = await apiFetch("/admin/reportes/ventas");
    document.getElementById("admin-stats").innerHTML = `
      <div class="card">
        <h3>📊 Reporte de Ventas</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-top:1rem">
          <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
            <div style="font-size:2rem;font-weight:700;color:#e65c00">${reporte.total_pedidos}</div>
            <div style="font-size:.85rem;color:#666">Total pedidos</div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
            <div style="font-size:2rem;font-weight:700;color:#2e7d32">${reporte.pedidos_entregados}</div>
            <div style="font-size:.85rem;color:#666">Entregados</div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
            <div style="font-size:2rem;font-weight:700;color:#f57f17">${reporte.pedidos_pendientes}</div>
            <div style="font-size:.85rem;color:#666">Pendientes</div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
            <div style="font-size:1.3rem;font-weight:700;color:#1a1a2e">${formatCLP(reporte.ingresos_totales_clp)}</div>
            <div style="font-size:.85rem;color:#666">Ingresos</div>
          </div>
        </div>
      </div>`;
  } catch {}
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Cerrar modal al hacer click fuera
  document.getElementById("modal-transferencia")?.addEventListener("click", function(e) {
    if (e.target === this) cerrarModalTransferencia();
  });

  await loadCategories();
  checkWebpayReturn();

  if (userInfo && token) redirectByRole();
  else { showPage("page-home"); loadCatalog(); }
});
