// ZapOfertas Capturar — Popup Script v5

const BACKEND_URL = 'https://zapofertas-backend.onrender.com';

// ── State manager ────────────────────────────────────────────────────────────

const STATES = ['not-shopee', 'not-product', 'loading', 'ready', 'success', 'error'];

function showState(name) {
  STATES.forEach((s) => {
    const el = document.getElementById(`state-${s}`);
    if (el) el.classList.toggle('active', s === name);
  });
}

function showError(msg) {
  document.getElementById('error-msg').textContent = msg;
  showState('error');
}

// ── Price formatter ──────────────────────────────────────────────────────────

function fmtPrice(value) {
  if (value == null) return null;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── Platform badge ───────────────────────────────────────────────────────────

function setPlatformBadge(platform) {
  const badge = document.getElementById('platform-badge');
  if (!badge) return;
  if (platform === 'mercadolivre') {
    badge.textContent = '🛒 Mercado Livre';
    badge.style.background = '#FFE600';
    badge.style.color = '#333';
  } else {
    badge.textContent = '🛍️ Shopee';
    badge.style.background = '#FF6633';
    badge.style.color = '#fff';
  }
  badge.style.display = 'inline-block';
}


// ── Injetar content.js e executar extração via executeScript ─────────────────
// Não usa chrome.tabs.sendMessage — evita "Receiving end does not exist"

async function injectAndExtract(tabId) {
  // 1. Injetar o content.js (guard interno previne redeclaração)
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });

  // 2. Aguardar o script inicializar
  await new Promise(r => setTimeout(r, 500));

  // 3. Chamar a função global exposta pelo content.js
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (typeof window.zapOfertasExtract === 'function') {
        return window.zapOfertasExtract();
      }
      return { success: false, code: 'EXTRACT_ERROR', error: 'Função não encontrada' };
    },
  });

  return results?.[0]?.result || null;
}

// ── Fill product UI ──────────────────────────────────────────────────────────

let capturedData = null;

function fillProduct(data) {
  capturedData = data;

  setPlatformBadge(data.platform || 'shopee');

  document.getElementById('product-name').textContent =
    data.productName || 'Nome não identificado';

  const img = document.getElementById('product-img');
  const placeholder = document.getElementById('product-img-placeholder');
  if (data.imageUrl) {
    img.src = data.imageUrl;
    img.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
  }

  document.getElementById('price-sale').textContent = fmtPrice(data.salePrice) || '—';

  const origEl = document.getElementById('price-original');
  if (data.originalPrice && data.originalPrice > (data.salePrice || 0)) {
    origEl.textContent = fmtPrice(data.originalPrice);
    origEl.style.display = 'inline';
  } else {
    origEl.style.display = 'none';
  }

  const badgeEl = document.getElementById('discount-badge');
  if (data.discountPercent > 0) {
    badgeEl.textContent = `-${data.discountPercent}%`;
    badgeEl.style.display = 'inline';
  } else {
    badgeEl.style.display = 'none';
  }

  const pixRowEl = document.getElementById('pix-row');
  if (pixRowEl) {
    if (data.pixPrice) {
      document.getElementById('price-pix').textContent = fmtPrice(data.pixPrice);
      pixRowEl.style.display = 'block';
    } else {
      pixRowEl.style.display = 'none';
    }
  }

  showState('ready');
}

// ── Extract from current tab ─────────────────────────────────────────────────

async function extractFromTab(tabId) {
  showState('loading');

  let result = null;
  try {
    result = await injectAndExtract(tabId);
  } catch (err) {
    showError(
      err.message?.includes('Cannot access')
        ? 'Não é possível acessar esta página. Recarregue a aba e tente novamente.'
        : `Erro ao acessar a página: ${err.message}`
    );
    return;
  }

  if (!result) {
    showError('Não foi possível extrair os dados. Recarregue a página e tente novamente.');
    return;
  }

  if (result.success && result.data) {
    fillProduct(result.data);
  } else if (result.code === 'NOT_PRODUCT_PAGE') {
    showState('not-product');
  } else {
    showError(result.error || 'Não foi possível extrair os dados desta página.');
  }
}

// ── Send to ZapOfertas backend ───────────────────────────────────────────────

async function sendToBackend() {
  if (!capturedData) return;

  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const res = await fetch(`${BACKEND_URL}/api/products/from-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capturedData),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro HTTP ${res.status}`);
    }

    showState('success');
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      showError('Não foi possível conectar ao ZapOfertas. Verifique se o sistema está online.');
    } else {
      showError(`Erro ao enviar: ${err.message}`);
    }
    btn.disabled = false;
    btn.textContent = 'Enviar para ZapOfertas →';
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function isSupportedUrl(url) {
  if (!url) return false;
  const isShopee = url.includes('shopee.com.br') &&
    !url.includes('/buyer/login') &&
    !url.includes('shopee.com.br/$');
  const isML = url.includes('mercadolivre.com.br') || url.includes('mercadolibre.com');
  return isShopee || isML;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!isSupportedUrl(tab?.url)) {
    showState('not-shopee');
    return;
  }

  await extractFromTab(tab.id);
}

// ── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('btn-send').addEventListener('click', sendToBackend);

document.getElementById('btn-retry').addEventListener('click', () => {
  init();
});

document.getElementById('open-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://zapofertas-frontend.onrender.com/novo-anuncio' });
});

// Start
init();
