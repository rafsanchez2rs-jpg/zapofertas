/**
 * URL Scraper — extrai dados de produtos de Shopee e Mercado Livre via URL
 * Usado pelo app Android (que nao tem extensao Chrome para injetar scripts)
 */

const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

// Cache simples com TTL (5 min)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(url) {
  const entry = cache.get(url);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(url);
  return null;
}

function setCache(url, data) {
  cache.set(url, { data, ts: Date.now() });
  // Limpar cache antigo
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
  }
}

// ── Detectar plataforma ─────────────────────────────────────────────────────

function detectPlatform(url) {
  if (url.includes('shopee.com.br')) return 'shopee';
  if (url.includes('mercadolivre.com.br') || url.includes('mercadolibre.com') || url.includes('meli.') || url.includes('/MLB') || url.includes('-MLB')) return 'mercadolivre';
  return null;
}

// ── SHOPEE SCRAPER ──────────────────────────────────────────────────────────

function extractShopeeIds(url) {
  // Formato: shopee.com.br/nome-do-produto-i.SHOPID.ITEMID
  const match = url.match(/i\.(\d+)\.(\d+)/);
  if (match) return { shopId: match[1], itemId: match[2] };

  // Formato de URL curta com product/SHOPID/ITEMID
  const match2 = url.match(/product\/(\d+)\/(\d+)/);
  if (match2) return { shopId: match2[1], itemId: match2[2] };

  return null;
}

async function scrapeShopeeApi(shopId, itemId) {
  try {
    const apiUrl = `https://shopee.com.br/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
    const { data } = await axios.get(apiUrl, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 10000,
    });

    const item = data?.data;
    if (!item) return null;

    const salePrice = (item.price || item.price_before_discount || 0) / 100000;
    const originalPrice = item.price_before_discount ? item.price_before_discount / 100000 : null;
    const discount = item.raw_discount || item.show_discount || 0;

    return {
      platform: 'shopee',
      productName: item.name || null,
      originalPrice: originalPrice && originalPrice > salePrice ? parseFloat(originalPrice.toFixed(2)) : null,
      salePrice: salePrice > 0 ? parseFloat(salePrice.toFixed(2)) : null,
      pixPrice: null,
      discountPercent: discount > 0 ? Math.round(discount) : null,
      imageUrl: item.image ? `https://down-br.img.susercontent.com/file/${item.image}` : null,
      couponValue: null,
      couponType: 'fixed',
      productUrl: `https://shopee.com.br/product/${shopId}/${itemId}`,
    };
  } catch (err) {
    console.warn('[Scraper] Shopee API failed:', err.message);
    return null;
  }
}

async function scrapeShopeeHtml(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 5,
    });

    const getMetaContent = (property) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(re);
      return match ? match[1] : null;
    };

    const productName = getMetaContent('og:title')?.replace(/\s*[\|–-]\s*Shopee.*$/i, '').trim() || null;
    const imageUrl = getMetaContent('og:image') || null;
    const priceStr = getMetaContent('product:price:amount');
    const salePrice = priceStr ? parseFloat(priceStr) : null;

    return {
      platform: 'shopee',
      productName,
      originalPrice: null,
      salePrice: salePrice && salePrice > 0 ? salePrice : null,
      pixPrice: null,
      discountPercent: null,
      imageUrl,
      couponValue: null,
      couponType: 'fixed',
      productUrl: url,
    };
  } catch (err) {
    console.warn('[Scraper] Shopee HTML failed:', err.message);
    return null;
  }
}

async function scrapeShopee(url) {
  const ids = extractShopeeIds(url);
  if (ids) {
    const apiResult = await scrapeShopeeApi(ids.shopId, ids.itemId);
    if (apiResult && apiResult.productName) return apiResult;
  }
  return scrapeShopeeHtml(url);
}

// ── MERCADO LIVRE SCRAPER ───────────────────────────────────────────────────

async function scrapeMercadoLivre(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 5,
    });

    const getMetaContent = (property) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(re);
      return match ? match[1] : null;
    };

    // Nome
    const titleMeta = getMetaContent('og:title');
    const productName = titleMeta
      ? titleMeta.replace(/\s*\|\s*MercadoLivre.*$/i, '').replace(/\s*-\s*Mercado Livre.*$/i, '').trim()
      : null;

    // Imagem
    const imageUrl = getMetaContent('og:image') || null;

    // Preco atual (meta tag)
    const priceStr = getMetaContent('product:price:amount');
    let salePrice = priceStr ? parseFloat(priceStr) : null;

    // Preco via andes-money-amount no HTML
    if (!salePrice) {
      const priceMatch = html.match(/class="andes-money-amount__fraction"[^>]*>([^<]+)</);
      if (priceMatch) {
        const intPart = priceMatch[1].replace(/\./g, '').trim();
        const centsMatch = html.match(/class="andes-money-amount__cents"[^>]*>([^<]+)</);
        const cents = centsMatch ? centsMatch[1].trim().padEnd(2, '0') : '00';
        salePrice = parseFloat(`${intPart}.${cents}`);
      }
    }

    // Preco original (riscado)
    let originalPrice = null;
    const originalMeta = getMetaContent('product:original_price:amount');
    if (originalMeta) {
      originalPrice = parseFloat(originalMeta);
    } else {
      // Buscar no HTML - preco original geralmente vem em price__original-value
      const origMatch = html.match(/price__original-value[\s\S]*?andes-money-amount__fraction"[^>]*>([^<]+)/);
      if (origMatch) {
        const intPart = origMatch[1].replace(/\./g, '').trim();
        originalPrice = parseFloat(intPart);
      }
    }

    // Validacao cruzada
    if (originalPrice && salePrice && originalPrice < salePrice) {
      [originalPrice, salePrice] = [salePrice, originalPrice];
    }
    if (originalPrice === salePrice) originalPrice = null;

    // Desconto
    let discountPercent = null;
    const discountMatch = html.match(/(\d+)\s*%\s*OFF/i) || html.match(/discount[^"]*"[^>]*>.*?(\d+)\s*%/i);
    if (discountMatch) {
      discountPercent = parseInt(discountMatch[1]);
    } else if (originalPrice && salePrice && originalPrice > salePrice) {
      discountPercent = Math.round((1 - salePrice / originalPrice) * 100);
    }

    return {
      platform: 'mercadolivre',
      productName,
      originalPrice: originalPrice && originalPrice > 0 ? parseFloat(originalPrice.toFixed(2)) : null,
      salePrice: salePrice && salePrice > 0 ? parseFloat(salePrice.toFixed(2)) : null,
      pixPrice: null,
      discountPercent,
      imageUrl,
      couponValue: null,
      couponType: 'fixed',
      productUrl: url,
    };
  } catch (err) {
    console.warn('[Scraper] Mercado Livre failed:', err.message);
    return null;
  }
}

// ── Resolver URL curta ──────────────────────────────────────────────────────

async function resolveShortUrl(url) {
  try {
    const response = await axios.head(url, {
      maxRedirects: 5,
      timeout: 5000,
      headers: { 'User-Agent': USER_AGENT },
    });
    return response.request?.res?.responseUrl || url;
  } catch (err) {
    // Tentar pegar da resposta de erro (redirect)
    if (err.response?.headers?.location) return err.response.headers.location;
    return url;
  }
}

// ── Funcao principal ────────────────────────────────────────────────────────

async function scrapeProductFromUrl(rawUrl) {
  // Resolver URL curta se necessario
  let url = rawUrl.trim();
  if (url.includes('s.shopee') || url.includes('bit.ly') || url.includes('meli.') || url.length < 60) {
    url = await resolveShortUrl(url);
  }

  // Checar cache
  const cached = getCached(url);
  if (cached) return cached;

  const platform = detectPlatform(url);

  let result = null;
  if (platform === 'shopee') {
    result = await scrapeShopee(url);
  } else if (platform === 'mercadolivre') {
    result = await scrapeMercadoLivre(url);
  } else {
    // Tentar resolver e detectar novamente
    const resolved = await resolveShortUrl(url);
    const resolvedPlatform = detectPlatform(resolved);
    if (resolvedPlatform === 'shopee') result = await scrapeShopee(resolved);
    else if (resolvedPlatform === 'mercadolivre') result = await scrapeMercadoLivre(resolved);
    else return null;
  }

  if (result) {
    // Garantir URL final
    result.productUrl = result.productUrl || url;
    setCache(url, result);
  }

  return result;
}

module.exports = { scrapeProductFromUrl };
