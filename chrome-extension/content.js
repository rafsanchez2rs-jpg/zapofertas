// ZapOfertas Capturar — Content Script v5
// Guard: evita erros de redeclaração se injetado mais de uma vez

if (!window.__zapOfertasLoaded) {
  window.__zapOfertasLoaded = true;

  // ── Detectar plataforma ─────────────────────────────────────────────────────
  const _hostname = window.location.hostname;
  const _platform = _hostname.includes('mercadolivre') || _hostname.includes('mercadolibre')
    ? 'mercadolivre'
    : 'shopee';

  // ── Limpeza de preço ────────────────────────────────────────────────────────
  function cleanPrice(text) {
    if (!text) return null;
    let clean = text.replace(/[^\d.,]/g, '').trim();
    if (!clean) return null;
    if (clean.includes(',') && clean.includes('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    }
    const value = parseFloat(clean);
    if (isNaN(value) || value <= 0) return null;
    return value;
  }

  // ── Verificar se elemento está em seção de frete/entrega ───────────────────
  function isInShippingSection(el) {
    let node = el;
    while (node && node !== document.body) {
      const cls = ((node.className && typeof node.className === 'string') ? node.className : '').toLowerCase();
      const id  = (node.id || '').toLowerCase();
      if (/shipping|freight|frete|delivery|entrega/.test(cls + id)) return true;
      node = node.parentElement;
    }
    return false;
  }

  // ── Tags ignoradas na busca de preço Pix ────────────────────────────────────
  const _SKIP_TAGS = new Set(['script','style','noscript','head','meta','link']);
  const _PIX_PATTERNS = [
    /pix[:\s]*r\$\s*([\d.]+,\d{2})/i,        // "Pix: R$114,00"
    /r\$\s*([\d.]+,\d{2})\s*(?:no\s+)?pix/i, // "R$114,00 no Pix"
  ];

  // ── Extração de preço Pix (compartilhada Shopee + ML) ─────────────────────
  function extractPixPrice(salePrice) {
    let pixPrice = null;

    // Estratégia 1: text nodes visíveis (ignora script/style/noscript)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !pixPrice) {
      const parentTag = (node.parentElement?.tagName || '').toLowerCase();
      if (_SKIP_TAGS.has(parentTag)) continue;
      if (isInShippingSection(node.parentElement)) continue;
      const txt = node.textContent.trim();
      if (!txt || txt.length > 80) continue;
      for (const pat of _PIX_PATTERNS) {
        const m = txt.match(pat);
        if (m) {
          const v = cleanPrice(m[1]);
          if (v && v > 1 && v < 50000) { pixPrice = v; break; }
        }
      }
    }

    // Estratégia 2: elementos curtos (< 50 chars) com "pix" + "R$"
    if (!pixPrice) {
      document.querySelectorAll('*').forEach(el => {
        if (pixPrice || el.children.length > 3 || isInShippingSection(el)) return;
        if (_SKIP_TAGS.has(el.tagName?.toLowerCase())) return;
        const txt = (el.innerText || '').trim();
        if (txt.length > 50 || !/pix/i.test(txt) || !/R\$/.test(txt)) return;
        for (const pat of _PIX_PATTERNS) {
          const m = txt.match(pat);
          if (m) {
            const v = cleanPrice(m[1]);
            if (v && v > 1 && v < 50000) { pixPrice = v; break; }
          }
        }
      });
    }

    // Sanidade: Pix deve ser <= preço de venda
    if (pixPrice && salePrice && pixPrice > salePrice * 1.05) pixPrice = null;

    return pixPrice ? parseFloat(pixPrice.toFixed(2)) : null;
  }

  // ── Extrair valor de um container .andes-money-amount ──────────────────────
  function extractAndesPrice(container) {
    if (!container) return null;
    const fraction = container.querySelector('.andes-money-amount__fraction');
    if (!fraction) return null;
    const intPart  = fraction.textContent.replace(/\./g, '').trim();
    const centsEl  = container.querySelector('.andes-money-amount__cents');
    const centPart = centsEl ? centsEl.textContent.trim().padEnd(2, '0') : '00';
    const v = parseFloat(`${intPart}.${centPart}`);
    return isNaN(v) || v <= 0 ? null : v;
  }

  // ── EXTRATOR MERCADO LIVRE ──────────────────────────────────────────────────
  function extractML() {
    // Nome
    const productName =
      document.querySelector('h1.ui-pdp-title')?.textContent?.trim() ||
      document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.content
        ?.replace(/\s*\|\s*MercadoLivre.*$/i, '').replace(/\s*-\s*Mercado Livre.*$/i, '').trim() ||
      null;

    // Preço atual — tentativa 1: seletores excluindo original
    let salePrice = null;
    const priceContainers = [
      '.ui-pdp-price__second-line .andes-money-amount',
      '.ui-pdp-price .andes-money-amount:not(.ui-pdp-price__original-value .andes-money-amount)',
      '.ui-pdp-price__main-price .andes-money-amount',
    ];
    for (const sel of priceContainers) {
      try {
        const v = extractAndesPrice(document.querySelector(sel));
        if (v && v > 1 && v < 100000) { salePrice = v; break; }
      } catch { /* ignore */ }
    }

    // Tentativa 2: meta tag
    if (!salePrice) {
      const metaPrice =
        document.querySelector('meta[itemprop="price"]') ||
        document.querySelector('meta[property="product:price:amount"]');
      if (metaPrice) {
        const v = parseFloat(metaPrice.getAttribute('content') || '');
        if (!isNaN(v) && v > 1) salePrice = v;
      }
    }

    // Tentativa 3: maior font-size entre todos .andes-money-amount
    if (!salePrice) {
      let maxFontSize = 0;
      document.querySelectorAll('.andes-money-amount').forEach(el => {
        if (el.closest('.ui-pdp-price__original-value') ||
            el.closest('[class*="price-original"]') ||
            el.closest('[class*="original"]')) return;
        if (isInShippingSection(el)) return;
        const fs = parseFloat(window.getComputedStyle(el).fontSize) || 0;
        if (fs > maxFontSize) {
          const v = extractAndesPrice(el);
          if (v && v > 1 && v < 100000) { maxFontSize = fs; salePrice = v; }
        }
      });
    }

    // Preço original (riscado)
    const getMLOriginalPrice = () => {
      // Tentativa 1: seletores específicos do ML
      const selectors = [
        '.ui-pdp-price__original-value .andes-money-amount__fraction',
        '[class*="price-original"] .andes-money-amount__fraction',
        '.ui-pdp-price s .andes-money-amount__fraction',
        '[class*="original"] .andes-money-amount__fraction',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const intPart  = el.textContent.replace(/\./g, '').trim();
          const centsEl  = el.closest('.andes-money-amount')
            ?.querySelector('.andes-money-amount__cents');
          const centPart = centsEl ? centsEl.textContent.trim().padEnd(2, '0') : '00';
          const price    = parseFloat(`${intPart}.${centPart}`);
          if (price > 0) return price;
        }
      }
      // Tentativa 2: qualquer .andes-money-amount com linha riscada
      for (const el of document.querySelectorAll('.andes-money-amount')) {
        const style    = window.getComputedStyle(el);
        const hasStrike =
          el.style.textDecoration?.includes('line-through') ||
          style.textDecoration?.includes('line-through')    ||
          el.closest('s') !== null                          ||
          el.closest('[style*="line-through"]') !== null;
        if (hasStrike) {
          const fraction = el.querySelector('.andes-money-amount__fraction');
          if (fraction) {
            const intPart  = fraction.textContent.replace(/\./g, '').trim();
            const cents    = el.querySelector('.andes-money-amount__cents');
            const centPart = cents ? cents.textContent.trim().padEnd(2, '0') : '00';
            const price    = parseFloat(`${intPart}.${centPart}`);
            if (price > 0) return price;
          }
        }
      }
      // Tentativa 3: meta tag
      const metaOriginal = document.querySelector(
        'meta[property="product:original_price:amount"]'
      );
      if (metaOriginal) return parseFloat(metaOriginal.content) || null;
      return null;
    };
    let originalPrice = getMLOriginalPrice();
    console.log('[ZapOfertas ML] originalPrice:', originalPrice);

    // Validação cruzada
    if (originalPrice && salePrice && originalPrice < salePrice) {
      [originalPrice, salePrice] = [salePrice, originalPrice];
    }
    if (originalPrice === salePrice) originalPrice = null;

    // Desconto
    let discountPercent = 0;
    const discountEl = document.querySelector(
      '.ui-pdp-price__discount, [class*="discount-label"], .andes-tag__label'
    );
    if (discountEl) {
      const m = discountEl.textContent.match(/(\d+)\s*%/);
      if (m) discountPercent = parseInt(m[1]);
    }
    if (!discountPercent && originalPrice && salePrice && originalPrice > salePrice) {
      discountPercent = Math.round((1 - salePrice / originalPrice) * 100);
    }

    // Imagem
    const imageUrl =
      document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector('.ui-pdp-gallery__figure img')?.src ||
      document.querySelector('figure img')?.src || null;

    // Cupom
    let couponValue = null;
    let couponType  = 'fixed';
    const couponEl  = document.querySelector(
      '.ui-pdp-promotions-pill-label, [class*="coupon"], [class*="discount-pill"]'
    );
    if (couponEl) {
      const txt = couponEl.textContent;
      const reaisMatch   = txt.match(/R\$\s*(\d+)/);
      const percentMatch = txt.match(/(\d+)\s*%\s*off/i);
      if (reaisMatch)        { couponValue = parseInt(reaisMatch[1]);   couponType = 'fixed'; }
      else if (percentMatch) { couponValue = parseInt(percentMatch[1]); couponType = 'percent'; }
    }

    const pixPrice = extractPixPrice(salePrice);

    return {
      platform: 'mercadolivre',
      productName,
      salePrice:     salePrice     ? parseFloat(salePrice.toFixed(2))     : null,
      originalPrice: originalPrice ? parseFloat(originalPrice.toFixed(2)) : null,
      pixPrice,
      discountPercent,
      imageUrl,
      couponValue,
      couponType,
      productUrl: window.location.href,
    };
  }

  // ── EXTRATOR SHOPEE ─────────────────────────────────────────────────────────
  function extractShopee() {
    // Nome
    let productName = null;
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim().length > 5) {
      productName = h1.textContent.trim();
    } else {
      const metaTitle = document.querySelector('meta[property="og:title"]');
      if (metaTitle?.content) {
        productName = metaTitle.content.replace(/\s*[\|–-]\s*Shopee.*$/i, '').trim();
      } else {
        productName = document.title.replace(/\s*[\|–-]\s*Shopee.*$/i, '').trim() || null;
      }
    }

    // Imagem
    const imageUrl =
      document.querySelector('meta[property="og:image"]')?.content ||
      [...document.querySelectorAll('img')]
        .filter(img => img.naturalWidth > 200 && img.src.startsWith('https'))
        .sort((a, b) => b.naturalWidth - a.naturalWidth)[0]?.src || null;

    // Preço atual
    let salePrice = null;
    const metaPrice = document.querySelector('meta[property="product:price:amount"]');
    if (metaPrice?.content) {
      const v = parseFloat(metaPrice.content);
      if (!isNaN(v) && v > 1 && v < 50000) salePrice = v;
    }
    if (!salePrice) {
      const priceSelectors = [
        '[class*="origin-block"] [class*="current"]',
        '[class*="price-section"] [class*="price--current"]',
        '[class*="flex-no-overflow"] [class*="price"]',
        '[class*="pdp-product-price"] [class*="price"]',
        '[class*="product-price"] [class*="price--base"]',
        '[class*="product-price--large"]',
      ];
      for (const sel of priceSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el && !isInShippingSection(el)) {
            const v = cleanPrice(el.innerText || el.textContent);
            if (v && v > 1 && v < 50000) { salePrice = v; break; }
          }
        } catch (_) {}
      }
    }
    if (!salePrice) {
      const candidates = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.children.length > 2 || isInShippingSection(el)) return;
        const txt = el.innerText || '';
        if (/R\$\s*[\d.,]+/.test(txt) && txt.length < 30) {
          const v = cleanPrice(txt);
          if (v && v > 1 && v < 50000) {
            const fontSize = parseFloat(window.getComputedStyle(el).fontSize) || 0;
            candidates.push({ v, fontSize });
          }
        }
      });
      if (candidates.length) {
        candidates.sort((a, b) => b.fontSize - a.fontSize);
        salePrice = candidates[0].v;
      }
    }

    // Preço original
    let originalPrice = null;
    document.querySelectorAll('*').forEach(el => {
      if (originalPrice || isInShippingSection(el)) return;
      const style = window.getComputedStyle(el);
      const isLineThrough =
        style.textDecoration.includes('line-through') ||
        !!el.closest('[class*="origin"],[class*="before"],[class*="original-price"],[class*="price-before"]');
      if (isLineThrough) {
        const v = cleanPrice(el.innerText || el.textContent);
        if (v && v > (salePrice || 0)) originalPrice = v;
      }
    });

    // Desconto
    let discountPercent = null;
    const discountEl = document.querySelector(
      '[class*="discount-rate"],[class*="discount_rate"],[class*="percent-off"],[class*="off-tag"]'
    );
    if (discountEl) {
      const m = (discountEl.innerText || '').match(/(\d+)/);
      if (m) discountPercent = parseInt(m[1]);
    }
    if (!discountPercent && originalPrice && salePrice && originalPrice > salePrice) {
      discountPercent = Math.round((1 - salePrice / originalPrice) * 100);
    }
    if (!discountPercent) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const m = node.textContent.match(/-(\d+)%/);
        if (m) { discountPercent = parseInt(m[1]); break; }
      }
    }

    // Pix
    const pixPrice = extractPixPrice(salePrice);

    // Cupom
    let couponValue = null;
    let couponType  = 'fixed';
    const couponEls = document.querySelectorAll(
      '[class*="voucher"],[class*="coupon"],[class*="coin-voucher"],[class*="discount-tag"]'
    );
    for (const el of couponEls) {
      const txt = el.innerText || '';
      const percentMatch = txt.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (percentMatch) {
        const v = parseFloat(percentMatch[1].replace(',', '.'));
        if (v > 0) { couponValue = v; couponType = 'percent'; break; }
      }
      const fixedMatch = txt.match(/R?\$?\s*(\d+(?:[.,]\d+)?)/);
      if (fixedMatch) {
        const v = cleanPrice(fixedMatch[0]);
        if (v && v > 0) { couponValue = v; couponType = 'fixed'; break; }
      }
    }

    return {
      platform: 'shopee',
      productName,
      originalPrice: originalPrice ? parseFloat(originalPrice.toFixed(2)) : null,
      salePrice:     salePrice     ? parseFloat(salePrice.toFixed(2))     : null,
      pixPrice:      pixPrice      ? parseFloat(pixPrice.toFixed(2))      : null,
      discountPercent,
      couponValue,
      couponType,
      imageUrl,
      productUrl: window.location.href,
    };
  }

  // ── Função global exposta para o popup via executeScript ───────────────────
  window.zapOfertasExtract = function() {
    try {
      if (_platform === 'mercadolivre') {
        const data = extractML();
        // Só sinaliza "não é produto" se não encontrou absolutamente nada
        if (!data.salePrice && !data.productName) {
          return { success: false, code: 'NOT_PRODUCT_PAGE' };
        }
        return { success: true, data };
      }
      return { success: true, data: extractShopee() };
    } catch (e) {
      return { success: false, code: 'EXTRACT_ERROR', error: e.message };
    }
  };

} // end guard __zapOfertasLoaded
