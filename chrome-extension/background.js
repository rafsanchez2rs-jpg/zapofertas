// ZapOfertas Capturar — Service Worker (MV3 required)
// Minimal background script; all logic lives in popup.js and content.js.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ZapOfertas] Extensão instalada.');
});
