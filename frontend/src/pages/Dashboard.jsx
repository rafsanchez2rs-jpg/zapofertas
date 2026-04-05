{
  "manifest_version": 3,
  "name": "ZapOfertas Capturar",
  "version": "1.1",
  "description": "Capture produtos da Shopee e Mercado Livre e envie para o ZapOfertas",
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": [
    "https://*.shopee.com.br/*",
    "https://*.mercadolivre.com.br/*",
    "https://*.mercadolibre.com/*",
    "https://zapofertas-backend.onrender.com/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.svg",
      "48": "icons/icon48.svg",
      "128": "icons/icon128.svg"
    }
  },
  "icons": {
    "16": "icons/icon16.svg",
    "48": "icons/icon48.svg",
    "128": "icons/icon128.svg"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*.shopee.com.br/*",
        "https://*.mercadolivre.com.br/*",
        "https://*.mercadolibre.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "background.js"
  }
}
