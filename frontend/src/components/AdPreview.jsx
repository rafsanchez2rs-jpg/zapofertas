import React from 'react';
import { MessageSquare } from 'lucide-react';

/**
 * Converte a formatação básica do WhatsApp em elementos React:
 *  *texto*  → <strong>
 *  _texto_  → <em>
 *  ~texto~  → <del>
 */
function renderWhatsAppText(text) {
  if (!text) return null;

  const lines = text.split('\n');

  return lines.map((line, li) => {
    // Tokeniza a linha em partes: texto normal | *bold* | _italic_ | ~strike~
    const parts = [];
    const regex = /(\*[^*]+\*|_[^_]+_|~[^~]+~)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: line.slice(lastIndex, match.index) });
      }
      const raw = match[0];
      if (raw.startsWith('*') && raw.endsWith('*')) {
        parts.push({ type: 'bold', value: raw.slice(1, -1) });
      } else if (raw.startsWith('_') && raw.endsWith('_')) {
        parts.push({ type: 'italic', value: raw.slice(1, -1) });
      } else if (raw.startsWith('~') && raw.endsWith('~')) {
        parts.push({ type: 'strike', value: raw.slice(1, -1) });
      }
      lastIndex = match.index + raw.length;
    }

    if (lastIndex < line.length) {
      parts.push({ type: 'text', value: line.slice(lastIndex) });
    }

    return (
      <React.Fragment key={li}>
        {parts.map((p, i) => {
          if (p.type === 'bold')   return <strong key={i} className="font-bold">{p.value}</strong>;
          if (p.type === 'italic') return <em     key={i}>{p.value}</em>;
          if (p.type === 'strike') return <del    key={i}>{p.value}</del>;
          return <span key={i}>{p.value}</span>;
        })}
        {li < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export default function AdPreview({ message, imageUrl, productName }) {
  if (!message) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
        <MessageSquare size={32} className="text-border" />
        <p className="text-text-secondary text-sm">
          O preview do anúncio aparecerá aqui
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">
        Preview — Como vai aparecer no WhatsApp
      </h3>

      {/* WhatsApp-like chat background */}
      <div
        className="rounded-xl p-4 min-h-32"
        style={{
          background: 'linear-gradient(135deg, #0c1317 0%, #111b21 100%)',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        <div className="max-w-xs">
          {imageUrl && (
            <div className="mb-1">
              <img
                src={imageUrl}
                alt={productName || 'Produto'}
                className="w-full rounded-lg rounded-bl-none object-cover max-h-48"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          )}

          <div className={`whatsapp-bubble px-3 py-2 text-sm leading-relaxed ${imageUrl ? 'rounded-t-none' : ''}`}>
            {renderWhatsAppText(message)}
          </div>

          <div className="text-right mt-0.5">
            <span className="text-xs text-gray-500">
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-text-secondary text-xs">{message.length} caracteres</span>
        <span className="text-text-secondary text-xs">~{Math.ceil(message.length / 160)} SMS equiv.</span>
      </div>
    </div>
  );
}
