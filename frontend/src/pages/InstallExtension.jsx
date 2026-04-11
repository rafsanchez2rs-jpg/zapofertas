import React, { useState } from 'react';
import { Download, Chrome, FolderOpen, ToggleRight, Puzzle, CheckCircle, ChevronDown, ChevronUp, Zap, ExternalLink } from 'lucide-react';

const EXT_DOWNLOAD_URL = 'https://github.com/rafsanchez2rs-jpg/zapofertas/releases/download/v1.1/zapofertas-extension.zip';

const STEPS = [
  {
    num: 1,
    icon: Download,
    title: 'Baixe o arquivo da extensão',
    desc: 'Clique no botão abaixo para baixar o arquivo ZIP da extensão ZapOfertas.',
    detail: 'O download iniciará automaticamente. Salve em um local que você não vá apagar, pois o Chrome precisará da pasta para manter a extensão funcionando.',
    action: (
      <a
        href={EXT_DOWNLOAD_URL}
        download
        className="inline-flex items-center gap-2 bg-accent text-black font-semibold px-5 py-2.5 rounded-xl hover:bg-accent/90 transition-colors text-sm mt-3"
      >
        <Download size={16} />
        Baixar extensão ZapOfertas (.zip)
      </a>
    ),
    screenshot: {
      label: 'Arquivo ZIP baixado na pasta Downloads',
      icon: '📦',
      hint: 'zapofertas-main.zip',
    },
  },
  {
    num: 2,
    icon: FolderOpen,
    title: 'Extraia o arquivo ZIP',
    desc: 'Clique com o botão direito no arquivo baixado e escolha "Extrair aqui" ou "Extrair tudo".',
    detail: 'Escolha uma pasta permanente (ex: Documentos). Não mova nem delete essa pasta depois — o Chrome precisa dela.',
    screenshot: {
      label: 'Clique com botão direito → "Extrair tudo..."',
      icon: '📂',
      hint: 'Extrair para: C:\\Documentos\\zapofertas-main',
    },
  },
  {
    num: 3,
    icon: Chrome,
    title: 'Abra as extensões do Chrome',
    desc: 'No Chrome, clique nos três pontos (⋮) no canto superior direito → Extensões → Gerenciar extensões.',
    detail: 'Ou acesse diretamente digitando na barra de endereço:',
    code: 'chrome://extensions',
    screenshot: {
      label: 'Página chrome://extensions no Chrome',
      icon: '🔲',
      hint: 'Menu → Extensões → Gerenciar extensões',
    },
  },
  {
    num: 4,
    icon: ToggleRight,
    title: 'Ative o Modo Desenvolvedor',
    desc: 'No canto superior direito da página de extensões, ative a chave "Modo do desenvolvedor".',
    detail: 'Esse modo permite instalar extensões fora da Chrome Web Store. Após ativar, novos botões aparecerão no topo da página.',
    screenshot: {
      label: 'Chave "Modo do desenvolvedor" ativada (azul)',
      icon: '🔧',
      hint: 'Canto superior direito → ativar toggle',
    },
  },
  {
    num: 5,
    icon: FolderOpen,
    title: 'Carregue a extensão',
    desc: 'Clique em "Carregar sem compactação" e selecione a pasta correta.',
    detail: 'Navegue até onde você extraiu o ZIP e selecione a pasta:',
    code: 'zapofertas-main → chrome-extension',
    screenshot: {
      label: 'Selecione a pasta "chrome-extension" dentro do ZIP extraído',
      icon: '📁',
      hint: 'zapofertas-main/chrome-extension',
    },
  },
  {
    num: 6,
    icon: Zap,
    title: 'Pronto! Extensão instalada ✅',
    desc: 'O ícone ⚡ ZapOfertas aparecerá na barra do Chrome. Clique nele ao visitar um produto na Shopee ou Mercado Livre.',
    detail: 'Se não ver o ícone, clique no ícone de peça de puzzle 🧩 na barra do Chrome e fixe a extensão ZapOfertas.',
    screenshot: {
      label: 'Ícone ⚡ ZapOfertas visível na barra do Chrome',
      icon: '⚡',
      hint: 'Barra superior do Chrome → ícone ⚡',
    },
  },
];

const FAQS = [
  {
    q: 'Preciso manter a pasta extraída para sempre?',
    a: 'Sim. O Chrome carrega a extensão diretamente dessa pasta. Se você mover ou deletar, a extensão para de funcionar e você precisará reinstalar.',
  },
  {
    q: 'A extensão não captura os dados do produto. O que fazer?',
    a: 'Feche e reabra a aba do produto e tente novamente. Se persistir, acesse chrome://extensions e clique no ícone de atualizar (🔄) na extensão ZapOfertas.',
  },
  {
    q: 'Para Mercado Livre, por que não funciona na lista de produtos?',
    a: 'A extensão só funciona na página individual do produto (quando você clica em um item específico). Não funciona em páginas de busca ou lista.',
  },
  {
    q: 'Aparece erro "Esta extensão não é de uma loja confiável". O que fazer?',
    a: 'Isso é normal para extensões instaladas no modo desenvolvedor. Clique em "Manter" para continuar usando normalmente. A extensão é segura.',
  },
];

function StepCard({ step, isLast }) {
  const Icon = step.icon;
  return (
    <div className="flex gap-4">
      {/* Line + circle */}
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-accent/15 border-2 border-accent/30 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-accent" />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-border mt-2 mb-0 min-h-8" />}
      </div>

      {/* Content */}
      <div className="pb-8 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
            Passo {step.num}
          </span>
        </div>
        <h3 className="text-text-primary font-semibold text-base mb-1">{step.title}</h3>
        <p className="text-text-secondary text-sm mb-1">{step.desc}</p>
        {step.detail && (
          <p className="text-text-secondary text-sm mb-2">{step.detail}</p>
        )}
        {step.code && (
          <code className="inline-block bg-white/5 border border-border text-accent text-sm px-3 py-1.5 rounded-lg font-mono mb-3">
            {step.code}
          </code>
        )}
        {step.action && <div>{step.action}</div>}

        {/* Screenshot placeholder */}
        <div className="mt-3 rounded-xl border border-border bg-white/2 p-4 flex items-center gap-3">
          <div className="text-3xl">{step.screenshot.icon}</div>
          <div>
            <p className="text-text-secondary text-xs font-medium">{step.screenshot.label}</p>
            <p className="text-text-secondary/60 text-xs mt-0.5 font-mono">{step.screenshot.hint}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/3 transition-colors"
      >
        <span className="text-text-primary text-sm font-medium">{q}</span>
        {open
          ? <ChevronUp size={16} className="text-accent flex-shrink-0" />
          : <ChevronDown size={16} className="text-text-secondary flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border bg-bg">
          <p className="text-text-secondary text-sm leading-relaxed pt-3">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function InstallExtension() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-10">

        {/* Header */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto">
            <Puzzle size={32} className="text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Instale a Extensão</h1>
            <p className="text-text-secondary mt-2 text-base">
              A extensão ⚡ ZapOfertas captura produtos da Shopee e Mercado Livre com 1 clique.
              Siga o passo a passo abaixo.
            </p>
          </div>
          <a
            href={EXT_DOWNLOAD_URL}
            download
            className="inline-flex items-center gap-2 bg-accent text-black font-bold px-6 py-3 rounded-xl hover:bg-accent/90 transition-colors text-base shadow-lg shadow-accent/20"
          >
            <Download size={18} />
            Baixar extensão (.zip)
          </a>
          <p className="text-text-secondary/60 text-xs">
            Compatível com Google Chrome · Instalação manual (modo desenvolvedor)
          </p>
        </div>

        {/* Steps */}
        <div className="card">
          <h2 className="text-text-primary font-semibold text-lg mb-6">Passo a passo</h2>
          <div>
            {STEPS.map((step, i) => (
              <StepCard key={step.num} step={step} isLast={i === STEPS.length - 1} />
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-3">
          <h2 className="text-text-primary font-semibold text-lg">Dúvidas frequentes</h2>
          {FAQS.map((f, i) => (
            <FaqItem key={i} q={f.q} a={f.a} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="card bg-accent/5 border-accent/20 text-center space-y-3">
          <CheckCircle size={28} className="text-accent mx-auto" />
          <p className="text-text-primary font-semibold">Extensão instalada? Acesse o ZapOfertas</p>
          <p className="text-text-secondary text-sm">Faça login ou crie sua conta para começar a disparar anúncios.</p>
          <a href="/login" className="inline-flex items-center gap-2 btn-primary text-sm">
            <ExternalLink size={14} />
            Acessar o ZapOfertas
          </a>
        </div>

      </div>
    </div>
  );
}
