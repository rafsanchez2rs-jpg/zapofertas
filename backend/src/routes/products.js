const express = require('express');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateAd } = require('../services/adGenerator');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Extension temporary store (in-memory, TTL 5 min) ─────────────────────────
let extensionStore = null; // { data, createdAt }
const EXTENSION_TTL = 5 * 60 * 1000;

// ── SSE clients waiting for extension data ────────────────────────────────────
const sseClients = new Set();

// GET /api/products/from-extension/stream?token=<JWT> — SSE push to frontend
router.get('/from-extension/stream', (req, res) => {
  const token = req.query.token;
  if (!token) { return res.status(401).json({ error: 'Token obrigatório' }); }
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    if (res.writableEnded) { clearInterval(heartbeat); return; }
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// POST /api/products/from-extension — called by Chrome extension (no auth)
router.post('/from-extension', (req, res) => {
  const { productName, originalPrice, salePrice, pixPrice, discountPercent, couponValue, couponType, couponLink, imageUrl, productUrl, description } = req.body;
  const data = { productName, originalPrice, salePrice, pixPrice, discountPercent, couponValue, couponType: couponType || 'fixed', couponLink: couponLink || null, imageUrl, productUrl, description: description || null };
  extensionStore = { data, createdAt: Date.now() };
  console.log('[Produto recebido]', JSON.stringify(req.body, null, 2));

  // Push to all SSE clients immediately
  if (sseClients.size > 0) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      if (!client.writableEnded) client.write(payload);
    }
    sseClients.clear();
    extensionStore = null; // consumed via SSE
  }

  res.json({ success: true });
});

// DELETE /api/products/from-extension/cache — clears stored extension data (authenticated)
router.delete('/from-extension/cache', authenticate, (req, res) => {
  extensionStore = null;
  res.json({ success: true });
});

// GET /api/products/from-extension/latest — polled by frontend (requires auth)
router.get('/from-extension/latest', authenticate, (req, res) => {
  if (!extensionStore || Date.now() - extensionStore.createdAt > EXTENSION_TTL) {
    return res.json({ data: null });
  }
  const { data } = extensionStore;
  extensionStore = null; // consume once
  res.json({ data });
});

// Strip the data:image/...;base64, prefix if present
function parseBase64Image(image) {
  if (image.startsWith('data:')) {
    const matches = image.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error('Formato de imagem inválido');
    return { mimeType: matches[1], data: matches[2] };
  }
  return { mimeType: 'image/jpeg', data: image };
}

// POST /api/products/extract-from-image
// Uses Gemini Vision to extract product data or description text from a screenshot
router.post('/extract-from-image', authenticate, async (req, res) => {
  try {
    const { image, purpose } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Imagem é obrigatória' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI__API_KEY;
    if (!apiKey || apiKey === 'sua_chave_aqui') {
      return res.json({ success: false, manual: true });
    }

    const { mimeType, data } = parseBase64Image(image);

    const prompt =
      purpose === 'description'
        ? `Extraia todo o texto descritivo relevante desta imagem de produto de e-commerce brasileiro.
Retorne apenas o texto extraído, sem JSON, sem prefixos, sem explicações.
Máximo 2 parágrafos curtos. Se não houver texto relevante, retorne string vazia.`
        : `Analise esta imagem de produto de e-commerce brasileiro e retorne APENAS um JSON com estes campos:
{
  "productName": "nome simples do produto, máximo 6 palavras",
  "originalPrice": número (preço original sem desconto, ex: 199.90) ou null,
  "salePrice": número (preço com desconto, ex: 89.90) ou null,
  "pixPrice": número (preço no pix se visível) ou null,
  "discountPercent": número inteiro (percentual de desconto, ex: 55) ou null,
  "couponValue": número (valor do cupom em reais se visível) ou null
}
Retorne SOMENTE o JSON, sem markdown, sem explicações.`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType, data } },
    ]);

    const content = result.response.text().trim();

    if (purpose === 'description') {
      return res.json({ success: true, description: content });
    }

    // Parse JSON — strip markdown fences if Gemini added them
    let extracted = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    } catch {
      // Return empty fields — frontend shows editable blanks
    }

    return res.json({
      success: true,
      productName: extracted.productName || '',
      originalPrice: extracted.originalPrice ?? null,
      salePrice: extracted.salePrice ?? null,
      pixPrice: extracted.pixPrice ?? null,
      discountPercent: extracted.discountPercent ?? null,
      couponValue: extracted.couponValue ?? null,
    });
  } catch (err) {
    console.warn('[Products] Gemini extract error:', err.message);
    return res.json({ success: false, manual: true });
  }
});

// POST /api/products/from-url — scraping server-side (para app Android)
const { scrapeProductFromUrl } = require('../services/urlScraper');

router.post('/from-url', authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL e obrigatoria' });

    const data = await scrapeProductFromUrl(url);
    if (!data) {
      return res.status(422).json({ error: 'Nao foi possivel extrair dados desta URL. Tente o modo manual.' });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[Products] from-url error:', err.message);
    res.status(500).json({ error: 'Erro ao processar URL' });
  }
});

// POST /api/products/generate-ad
// Generate ad message from product data (called after manual edits too)
router.post('/generate-ad', authenticate, async (req, res) => {
  try {
    const { productData } = req.body;

    if (!productData) {
      return res.status(400).json({ error: 'productData é obrigatório' });
    }

    const ad = await generateAd(productData, String(req.user.id));
    res.json({ ad });
  } catch (err) {
    console.error('[Products] generate-ad error:', err);
    res.status(500).json({ error: err.message || 'Erro ao gerar anúncio' });
  }
});

module.exports = router;
