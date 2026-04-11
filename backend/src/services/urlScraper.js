/**
 * URL Scraper — extrai dados de produtos de Shopee e Mercado Livre via URL
 * Usado pelo app Android (que nao tem extensao Chrome para injetar scripts)
 *
 * Estrategia Shopee:
 *   1. Link curto (s.shopee.com.br) → HTML com JS que contem shopId/itemId
 *   2. Extrai IDs do CONFIG.httpUrl embutido no HTML
 *   3. Usa URL /product/SHOPID/ITEMID para pegar meta tags (og:title, og:image)
 *   4. API v4 como fallback para precos
 *
 * Estrategia ML:
 *   1. Acessa URL direta e le meta tags + HTML
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
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
  }
}

// ── Detectar plataforma ─────────────────────────────────────────────────────

function detectPlatform(url) {
  if (url.includes('shopee.com.br') || url.includes('s.shopee')) return 'shopee';
  if (url.includes('mercadolivre.com.br') || url.includes('mercadolibre.com') || url.includes('meli.') || url.includes('/MLB') || url.includes('-MLB')) return 'mercadolivre';
  return null;
}

// ── Extrair shopId/itemId de qualquer URL Shopee ────────────────────────────

function extractShopeeIds(text) {
  // Formato: i.SHOPID.ITEMID (URL normal)
  let match = text.match(/i\.(\d+)\.(\d+)/);
  if (match) return { shopId: match[1], itemId: match[2] };

  // Formato: product/SHOPID/ITEMID
  match = text.match(/product\/(\d+)\/(\d+)/);
  if (match) return { shopId: match[1], itemId: match[2] };

  // Formato: opaanlp/SHOPID/ITEMID (link de afiliado)
  match = text.match(/opaanlp\/(\d+)\/(\d+)/);
  if (match) return { shopId: match[1], itemId: match[2] };

  return null;
}

// ── Resolver link curto Shopee via HTML parsing ─────────────────────────────

async function resolveShopeeShortUrl(shortUrl) {
  try {
    const { data: html } = await axios.get(shortUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 5,
    });

    // Extrair httpUrl do CONFIG no JavaScript
    const httpUrlMatch = html.match(/httpUrl\s*:\s*"([^"]+)"/);
    if (httpUrlMatch) {
      // Decodificar unicode escapes (\u0026 = &)
      const decoded = httpUrlMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
        String.fromCharCode(parseInt(code, 16))
      );
      console.log('[Scraper] Shopee short URL resolved to:', decoded.substring(0, 100));
      return decoded;
    }

    // Tentar extrair IDs direto do HTML
    const ids = extractShopeeIds(html);
    if (ids) {
      return `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`;
    }

    return shortUrl;
  } catch (err) {
    console.warn('[Scraper] Failed to resolve Shopee short URL:', err.message);
    return shortUrl;
  }
}

// ── SHOPEE SCRAPER via meta tags ────────────────────────────────────────────

async function scrapeShopeeProduct(shopId, itemId) {
  try {
    // Usar URL /product/SHOPID/ITEMID que retorna meta tags confiaveis
    const productUrl = `https://shopee.com.br/product/${shopId}/${itemId}`;
    const { data: html } = await axios.get(productUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 5,
    });

    const getMetaContent = (property) => {
      // Suporta ambos os formatos: property="X" content="Y" e data-rh="true" property="X" content="Y"
      const re = new RegExp(`(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(re);
      return match ? match[1] : null;
    };

    const rawTitle = getMetaContent('og:title');
    const productName = rawTitle
      ? rawTitle.replace(/\s*[\|–-]\s*Shopee.*$/i, '').trim()
      : null;

    const imageUrl = getMetaContent('og:image') || null;
    const priceStr = getMetaContent('product:price:amount');
    const salePrice = priceStr ? parseFloat(priceStr) : null;

    console.log(`[Scraper] Shopee product: "${productName}", price: ${salePrice}, image: ${imageUrl ? 'yes' : 'no'}`);

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
      productUrl: productUrl,
    };
  } catch (err) {
    console.warn('[Scraper] Shopee product page failed:', err.message);
    return null;
  }
}

// ── SHOPEE: fluxo principal ─────────────────────────────────────────────────

async function scrapeShopee(url) {
  let resolvedUrl = url;

  // Se é link curto (s.shopee.com.br), resolver via HTML parsing
  if (url.includes('s.shopee.com.br')) {
    resolvedUrl = await resolveShopeeShortUrl(url);
  }

  // Extrair IDs do produto
  const ids = extractShopeeIds(resolvedUrl);
  if (ids) {
    const result = await scrapeShopeeProduct(ids.shopId, ids.itemId);
    if (result && result.productName) return result;
  }

  // Fallback: tentar meta tags da URL direta
  try {
    const { data: html } = await axios.get(resolvedUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 5,
    });

    const getMetaContent = (property) => {
      const re = new RegExp(`(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(re);
      return match ? match[1] : null;
    };

    const rawTitle = getMetaContent('og:title');
    if (rawTitle && !rawTitle.includes('Shopee Brasil | Ofertas')) {
      return {
        platform: 'shopee',
        productName: rawTitle.replace(/\s*[\|–-]\s*Shopee.*$/i, '').trim(),
        originalPrice: null,
        salePrice: null,
        pixPrice: null,
        discountPercent: null,
        imageUrl: getMetaContent('og:image') || null,
        couponValue: null,
        couponType: 'fixed',
        productUrl: resolvedUrl,
      };
    }
  } catch {}

  return null;
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
      const re = new RegExp(`(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
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

    console.log(`[Scraper] ML product: "${productName}", price: ${salePrice}, original: ${originalPrice}`);

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

// ── Resolver URL curta generica ─────────────────────────────────────────────

async function resolveShortUrl(url) {
  try {
    const response = await axios.head(url, {
      maxRedirects: 5,
      timeout: 5000,
      headers: { 'User-Agent': USER_AGENT },
    });
    return response.request?.res?.responseUrl || url;
  } catch (err) {
    if (err.response?.headers?.location) return err.response.headers.location;
    return url;
  }
}

// ── Funcao principal ────────────────────────────────────────────────────────

async function scrapeProductFromUrl(rawUrl) {
  let url = rawUrl.trim();

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
    // Tentar resolver URL curta e detectar novamente
    const resolved = await resolveShortUrl(url);
    const resolvedPlatform = detectPlatform(resolved);
    if (resolvedPlatform === 'shopee') result = await scrapeShopee(resolved);
    else if (resolvedPlatform === 'mercadolivre') result = await scrapeMercadoLivre(resolved);
    else return null;
  }

  if (result) {
    // Manter a URL original (link de afiliado) como productUrl
    result.productUrl = rawUrl.trim();
    setCache(url, result);
  }

  return result;
}

module.exports = { scrapeProductFromUrl };
