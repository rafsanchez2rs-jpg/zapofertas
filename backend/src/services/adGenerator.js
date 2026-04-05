const HEADLINES = [
  'OFERTA RELÂMPAGO',
  'PREÇO DE AMIGO',
  'TÁ DE GRAÇA',
  'IMPOSSÍVEL IGNORAR',
  'CORRE QUE VAI ACABAR',
  'MEU BOLSO AGRADECEU',
  'NÃO ACREDITEI NO PREÇO',
  'ACHEI E VIM AVISAR',
  'PASSOU RAIVA COM ESSE PREÇO',
  'ISSO NÃO É NORMAL',
  'VAI PERDER ESSA?',
  'SAINDO DE GRAÇA',
];

// Anti-repetição: não sortear a mesma headline duas vezes seguidas
const lastHeadlineMap = new Map();
function getHeadline(userId = 'default') {
  const last = lastHeadlineMap.get(userId) ?? -1;
  let idx;
  do {
    idx = Math.floor(Math.random() * HEADLINES.length);
  } while (idx === last && HEADLINES.length > 1);
  lastHeadlineMap.set(userId, idx);
  return HEADLINES[idx];
}

function simplifyProductName(name) {
  if (!name) return 'Produto';
  let simplified = name
    .replace(/\([^)]{6,}\)/g, '')
    .replace(/\[[^\]]{4,}\]/g, '')
    .replace(/\b[A-Z0-9]{6,}\b/g, '')
    .replace(/\+mais\b/gi, '')
    .trim();
  simplified = simplified
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  const words = simplified.split(/\s+/).filter(Boolean);
  if (words.length > 8) simplified = words.slice(0, 8).join(' ');
  return simplified || name.split(' ').slice(0, 5).join(' ');
}

function formatPrice(value) {
  if (value == null || isNaN(value) || value <= 0) return null;
  return 'R$ ' + parseFloat(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function generateAd(productData, userId = 'default') {
  const {
    productName,
    originalPrice,
    salePrice,
    pixPrice,
    discountPercent: rawDiscount,
    couponValue,
    couponType,
    couponCode,
    couponLink,
    productUrl,
    platform,
  } = productData;

  // Recalcular desconto se não veio ou veio zerado mas temos os dois preços
  let discountPercent = rawDiscount || 0;
  if (!discountPercent && originalPrice > 0 && salePrice > 0 && originalPrice > salePrice) {
    discountPercent = Math.round((1 - salePrice / originalPrice) * 100);
  }

  // Detectar plataforma — aceita campo platform OU URL como fallback
  const isML =
    platform === 'mercadolivre' ||
    !!(productUrl && (
      productUrl.includes('mercadolivre') ||
      productUrl.includes('mercadolibre') ||
      productUrl.includes('meli')
    ));

  // Decidir headline
  const useHeadline = discountPercent >= 40 || (salePrice > 0 && salePrice <= 60);
  const headline    = useHeadline ? getHeadline(userId) : null;

  console.log('[AdGenerator] platform:', platform, '| isML:', isML,
    '| discount:', discountPercent, '| useHeadline:', useHeadline);

  const simpleName = simplifyProductName(productName);
  const lines      = [];

  // ── Identificador ML — SEMPRE para mercadolivre ─────────────────────────────
  if (isML) {
    lines.push('*PROMO NO MELI* 💛');
    if (!headline) lines.push('');
  }

  // ── Headline em negrito ──────────────────────────────────────────────────────
  if (headline) {
    lines.push(`*${headline}!* 🌩️🏃‍♀️`);
    lines.push('');
  }

  // ── Nome do produto ──────────────────────────────────────────────────────────
  lines.push(`🛍️ ${simpleName}`);
  lines.push('');

  // ── Preços ───────────────────────────────────────────────────────────────────
  if (originalPrice && originalPrice > 0 && originalPrice > salePrice) {
    lines.push(`De❌ ${formatPrice(originalPrice)}`);
  }
  // Se pixPrice == salePrice, o preço já é o preço PIX — exibe o label "NO PIX" na linha Por
  const isPIXPrice = pixPrice && pixPrice > 0 && Math.abs(pixPrice - salePrice) < 0.01;
  lines.push(`Por 🔥 ${formatPrice(salePrice)}${isPIXPrice ? ' NO PIX' : ''}`);
  if (pixPrice && pixPrice > 0 && pixPrice < salePrice) {
    lines.push(`No Pix 💰 ${formatPrice(pixPrice)}`);
  }

  // ── Cupom ────────────────────────────────────────────────────────────────────
  const cleanCode = couponCode ? String(couponCode).trim().toUpperCase() : null;
  const cleanLink = couponLink ? String(couponLink).trim() : null;
  const hasAnyCoupon = cleanCode || cleanLink || (couponValue && couponValue > 0);

  if (hasAnyCoupon) {
    lines.push('');
    if (cleanCode) {
      lines.push(`Aplique o cupom 🎟️ *${cleanCode}*`);
    } else if (cleanLink) {
      const couponDisplay = couponType === 'percent'
        ? `${couponValue}%`
        : (couponValue ? formatPrice(couponValue) : '');
      lines.push(`Resgate o cupom 🎟️${couponDisplay ? ` ${couponDisplay} OFF` : ''}👇`);
      lines.push(cleanLink);
    }
  }

  // ── CTA ──────────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('Compre aqui✅ 👇');
  lines.push(productUrl);
  lines.push('');
  lines.push('*Essa oferta pode acabar a qualquer momento 🏃‍♀️*');

  const message = lines.join('\n');

  return {
    message,
    hasHeadline: !!headline,
    headline:    headline || null,
    simpleName,
    platform:    isML ? 'mercadolivre' : (platform || 'shopee'),
  };
}

module.exports = { generateAd, simplifyProductName, formatPrice, shouldUseHeadline: (s, d) => d >= 40 || (s > 0 && s <= 60) };
