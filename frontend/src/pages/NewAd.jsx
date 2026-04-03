import React, { useState, useEffect, useCallback } from 'react';
import {
  Send, RefreshCw, Edit3, CheckCircle, XCircle, AlertCircle,
  ChevronDown, ChevronUp, Loader, ArrowRight, ArrowLeft,
  Calendar, Zap, ShoppingCart, Puzzle, Settings, Wifi, WifiOff,
  Tag,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import AdPreview from '../components/AdPreview';
import GroupSelector from '../components/GroupSelector';
import { useAuth } from '../context/AuthContext';

const STEPS = ['Capturar', 'Revisar', 'Link', 'Disparar'];

const parsePrice = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
};

const fmt = (v) => {
  const n = parsePrice(v);
  return n != null && n > 0
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
};

const EMPTY_FIELDS = {
  productName: '', originalPrice: '', salePrice: '',
  pixPrice: '', discountPercent: '', couponValue: '',
};

const detectPlatform = (platform, productUrl) => {
  const url = productUrl || '';
  if (
    url.includes('mercadolivre') ||
    url.includes('mercadolibre') ||
    url.includes('meli.') ||
    url.includes('/MLB') ||
    url.includes('-MLB') ||
    platform === 'mercadolivre'
  ) return 'mercadolivre';
  return 'shopee';
};

export default function NewAd() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const maxGroups = user?.plan === 'pro' ? null : 3;

  const [step, setStep] = useState(1);

  // ── WhatsApp status ────────────────────────────────────────────────────────
  const [waStatus, setWaStatus] = useState('disconnected');
  const [showWaWarning, setShowWaWarning] = useState(false);

  // ── Captured data ──────────────────────────────────────────────────────────
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [platform, setPlatform] = useState('shopee'); // 'shopee' | 'mercadolivre'
  const [extensionImageUrl, setExtensionImageUrl] = useState(null);
  const [captureStatus, setCaptureStatus] = useState('waiting'); // waiting | success
  const [showManual, setShowManual] = useState(false);

  // ── Cupom (Step 2) ─────────────────────────────────────────────────────────
  const [couponEnabled, setCouponEnabled] = useState(false);
  const [couponDisplayType, setCouponDisplayType] = useState('code'); // 'code' | 'link'
  const [couponCode, setCouponCode] = useState('');
  const [couponLink, setCouponLink] = useState('');
  const [useDefaultCouponLink, setUseDefaultCouponLink] = useState(false);
  const [defaultCouponLink, setDefaultCouponLink] = useState('');

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  const [affiliateLink, setAffiliateLink] = useState('');
  const [linkError, setLinkError] = useState('');
  const [generating, setGenerating] = useState(false);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);

  // ── Step 4 ─────────────────────────────────────────────────────────────────
  const [adMessage, setAdMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [scheduleOption, setScheduleOption] = useState('now');
  const _agora = new Date();
  const _proxHora = new Date(_agora); _proxHora.setHours(_proxHora.getHours() + 1, 0, 0, 0);
  const [customDate, setCustomDate] = useState(_agora.toISOString().split('T')[0]);
  const [customTime, setCustomTime] = useState(_proxHora.toTimeString().slice(0, 5));

  useEffect(() => {
    api.get('/groups').then(({ data }) => setGroups(data.groups || [])).catch(() => {});
    // Load default coupon link from settings
    api.get('/whatsapp/settings').then(({ data }) => {
      const link = data.settings?.coupon_default_link || '';
      setDefaultCouponLink(link);
    }).catch(() => {});
  }, []);

  // ── Poll WhatsApp status every 5s ─────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await api.get('/whatsapp/status');
        setWaStatus(data.status || 'disconnected');
      } catch {
        setWaStatus('disconnected');
      }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  // ── Apply captured product data ───────────────────────────────────────────
  const applyExtensionData = useCallback((p) => {
    setFields({
      productName: p.productName || '',
      originalPrice: p.originalPrice != null ? String(p.originalPrice) : '',
      salePrice: p.salePrice != null ? String(p.salePrice) : '',
      pixPrice: p.pixPrice != null ? String(p.pixPrice) : '',
      discountPercent: p.discountPercent != null ? String(p.discountPercent) : '',
      couponValue: p.couponValue != null ? String(p.couponValue) : '',
    });
    if (p.platform) setPlatform(p.platform);
    if (p.couponValue && p.couponValue > 0) setCouponEnabled(true);
    if (p.imageUrl) setExtensionImageUrl(p.imageUrl);
    if (p.productUrl) setAffiliateLink(p.productUrl);
    setCaptureStatus('success');
    setTimeout(() => setStep(2), 800);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SSE listener for extension data (with polling fallback) ───────────────
  useEffect(() => {
    if (step !== 1 || captureStatus === 'success') return;

    const token = localStorage.getItem('accessToken');
    const apiBase = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;
    const sseUrl = `${apiBase}/products/from-extension/stream?token=${encodeURIComponent(token || '')}`;

    let es = null;
    let pollInterval = null;
    let active = true;

    const startPollingFallback = () => {
      if (pollInterval) return;
      let attempts = 0;
      const MAX = 15;
      pollInterval = setInterval(async () => {
        if (!active) { clearInterval(pollInterval); return; }
        attempts++;
        if (attempts > MAX) { clearInterval(pollInterval); return; }
        try {
          const { data } = await api.get('/products/from-extension/latest');
          if (data.data) {
            clearInterval(pollInterval);
            applyExtensionData(data.data);
          }
        } catch { /* ignore */ }
      }, 2000);
    };

    try {
      es = new EventSource(sseUrl);

      es.onmessage = (event) => {
        if (!active) return;
        try {
          const p = JSON.parse(event.data);
          es.close();
          if (pollInterval) clearInterval(pollInterval);
          applyExtensionData(p);
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        startPollingFallback();
      };
    } catch {
      startPollingFallback();
    }

    return () => {
      active = false;
      if (es) es.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [step, captureStatus, applyExtensionData]);

  // Apply default coupon link when checkbox is ticked
  useEffect(() => {
    if (useDefaultCouponLink && defaultCouponLink) {
      setCouponLink(defaultCouponLink);
    }
  }, [useDefaultCouponLink, defaultCouponLink]);

  const buildProductData = () => ({
    productName: fields.productName || 'Produto',
    originalPrice: parsePrice(fields.originalPrice) || 0,
    salePrice: parsePrice(fields.salePrice) || 0,
    pixPrice: parsePrice(fields.pixPrice),
    discountPercent: parseInt(fields.discountPercent) || 0,
    couponValue: parsePrice(fields.couponValue),
    couponCode: couponEnabled && couponDisplayType === 'code' ? couponCode.trim() || null : null,
    couponLink: couponEnabled && couponDisplayType === 'link' ? couponLink.trim() || null : null,
    productUrl: affiliateLink.trim(),
    platform,
  });

  const isScheduled = scheduleOption !== 'now';

  const getScheduledAt = () => {
    const now = new Date();
    switch (scheduleOption) {
      case '30min': return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      case '1h':    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      case '2h':    return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
      case 'tomorrow9': { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); }
      case 'nextweek9': { const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d.toISOString(); }
      case 'custom': {
        if (!customDate || !customTime) return null;
        return new Date(`${customDate}T${customTime}`).toISOString();
      }
      default: return null;
    }
  };

  const scheduleDisplayText = () => {
    if (!isScheduled) return '✅ Será disparado imediatamente';
    const sat = getScheduledAt();
    if (!sat) return '⚠️ Selecione data e hora';
    const d = new Date(sat);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === tomorrow.toDateString()) return `📅 Agendado para amanhã às ${timeStr}`;
    return `📅 Agendado para ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${timeStr}`;
  };

  const handleGenerateAd = async () => {
    const link = affiliateLink.trim();
    if (!link) { setLinkError('Insira o link do produto'); return; }
    try { new URL(link); } catch { setLinkError('URL inválida'); return; }
    setLinkError('');
    setGenerating(true);
    try {
      const { data } = await api.post('/products/generate-ad', { productData: buildProductData() });
      setAdMessage(data.ad.message);
      setStep(4);
    } catch (err) {
      setLinkError(err.response?.data?.error || 'Erro ao gerar anúncio');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      const { data } = await api.post('/products/generate-ad', { productData: buildProductData() });
      setAdMessage(data.ad.message);
    } catch { /* ignore */ }
  };

  const showToast = useCallback((message, type = 'success', autoResetMs = null) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
    if (autoResetMs != null) {
      setTimeout(() => resetAll(), autoResetMs);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDispatch = async () => {
    if (!adMessage || selectedGroups.length === 0) return;

    if (!isScheduled && waStatus !== 'ready') {
      setShowWaWarning(true);
      return;
    }

    const scheduledAt = getScheduledAt();

    setDispatching(true);
    setDispatchResult(null);

    try {
      const { data } = await api.post('/campaigns', {
        ...buildProductData(),
        imageUrl: extensionImageUrl || null,
        message: adMessage,
        groupIds: selectedGroups,
        scheduledAt: scheduledAt || undefined,
      });

      api.delete('/products/from-extension/cache').catch(() => {});

      if (data.status === 'scheduled') {
        setDispatching(false);
        showToast(`✅ Anúncio agendado para ${selectedGroups.length} grupo${selectedGroups.length > 1 ? 's' : ''}!`, 'success', 3000);
        return;
      }

      const campaignId = data.campaignId;
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const { data: cd } = await api.get(`/campaigns/${campaignId}`);
          const status = cd.campaign?.status;
          if (status === 'sent' || status === 'partial' || status === 'failed') {
            clearInterval(pollInterval);
            setDispatching(false);
            if (status === 'failed') {
              const errMsg = cd.groups?.find((g) => g.error_message)?.error_message
                || 'Falha ao enviar. Verifique se o WhatsApp está conectado.';
              setDispatchResult({ success: false, error: errMsg });
            } else {
              const sentCount = cd.groups?.filter((g) => g.status === 'sent').length ?? selectedGroups.length;
              const msg = status === 'partial'
                ? `⚠️ Enviado parcialmente (${sentCount} grupo${sentCount > 1 ? 's' : ''})`
                : `✅ Enviado para ${sentCount} grupo${sentCount > 1 ? 's' : ''} com sucesso!`;
              showToast(msg, status === 'partial' ? 'warning' : 'success', 3000);
            }
          } else if (attempts >= 30) {
            clearInterval(pollInterval);
            setDispatching(false);
            setDispatchResult({ success: false, error: 'Tempo esgotado. Verifique o histórico.' });
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (err) {
      setDispatching(false);
      setDispatchResult({ success: false, error: err.response?.data?.error || 'Erro ao criar campanha' });
    }
  };

  const resetAll = () => {
    setStep(1);
    setFields(EMPTY_FIELDS);
    setPlatform('shopee');
    setCouponEnabled(false);
    setCouponDisplayType('code');
    setCouponCode('');
    setCouponLink('');
    setUseDefaultCouponLink(false);
    setExtensionImageUrl(null);
    setCaptureStatus('waiting');
    setShowManual(false);
    setAffiliateLink('');
    setLinkError('');
    setAdMessage('');
    setSelectedGroups([]);
    setScheduleOption('now');
    setCustomDate('');
    setCustomTime('');
    setDispatchResult(null);
    setEditMode(false);
    setToast(null);
  };

  // ── Field helper ───────────────────────────────────────────────────────────
  const Field = ({ label, fieldKey, placeholder, colSpan = '' }) => (
    <div className={colSpan}>
      <label className="text-text-secondary text-xs block mb-1">{label}</label>
      <input
        type="text"
        value={fields[fieldKey]}
        onChange={(e) => setFields((f) => ({ ...f, [fieldKey]: e.target.value }))}
        className="input text-sm"
        placeholder={placeholder}
      />
    </div>
  );

  // ── Step bar ───────────────────────────────────────────────────────────────
  const StepBar = () => (
    <div className="card mb-6">
      <div className="flex items-center">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const active = step === num;
          const done = step > num;
          return (
            <React.Fragment key={num}>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  done
                    ? 'bg-accent text-black'
                    : active
                    ? 'bg-accent/20 border-2 border-accent text-accent'
                    : 'bg-white/5 border border-border text-text-secondary'
                }`}>
                  {done ? <CheckCircle size={16} /> : num}
                </div>
                <span className={`text-xs hidden sm:block ${
                  active ? 'text-accent' : done ? 'text-text-secondary' : 'text-text-secondary/50'
                }`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 transition-colors ${done ? 'bg-accent' : 'bg-border'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl animate-fade-in">

      {/* ── Modal WA desconectado ── */}
      {showWaWarning && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm animate-slide-up">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center">
                <WifiOff size={28} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-text-primary font-bold text-base mb-1">⚠️ WhatsApp Desconectado</h3>
                <p className="text-text-secondary text-sm">
                  Vá em Configurações e conecte seu WhatsApp antes de disparar.
                </p>
              </div>
              <div className="flex gap-2 w-full">
                <button type="button" onClick={() => setShowWaWarning(false)} className="btn-secondary flex-1 text-sm">
                  Cancelar
                </button>
                <button type="button" onClick={() => navigate('/configuracoes')} className="btn-primary flex-1 text-sm">
                  <Settings size={14} />
                  Ir para Configurações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-slide-up ${
          toast.type === 'success'
            ? 'bg-card border-accent/30 text-accent'
            : toast.type === 'warning'
            ? 'bg-card border-yellow-500/30 text-yellow-400'
            : 'bg-card border-red-500/30 text-red-400'
        }`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => navigate('/historico')} className="underline opacity-80 hover:opacity-100 text-xs ml-1">
            Ver histórico →
          </button>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Novo Anúncio</h1>
        <p className="text-text-secondary text-sm mt-1">
          Capture um produto com a extensão e dispare para seus grupos
        </p>
      </div>

      <StepBar />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Left column ── */}
        <div className="space-y-5">

          {/* STEP 1 — Capturar produto */}
          {step === 1 && (
            <div className="card animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center text-black text-xs font-bold flex-shrink-0">1</div>
                <h2 className="text-text-primary font-semibold text-sm">Capturar produto</h2>
              </div>

              <div className="bg-white/3 rounded-xl p-5 mb-5">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-accent/15 border border-accent/30 rounded-2xl flex items-center justify-center">
                    <Zap size={30} className="text-accent" />
                  </div>
                  <p className="text-text-primary font-medium text-sm text-center">
                    Use a extensão <span className="text-accent">ZapOfertas</span> no Chrome para capturar o produto
                  </p>

                  {/* Platform badges */}
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                      🛍️ Shopee
                    </span>
                    <span className="text-text-secondary text-xs">e</span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                      🛒 Mercado Livre
                    </span>
                  </div>

                  <div className="w-full space-y-2.5">
                    {[
                      { icon: <ShoppingCart size={15} />, text: 'Acesse o produto na Shopee ou Mercado Livre' },
                      { icon: <Puzzle size={15} />, text: 'Clique na extensão ZapOfertas no Chrome' },
                      { icon: <Zap size={15} />, text: 'Clique em Enviar — dados chegam aqui automaticamente!' },
                    ].map(({ icon, text }, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
                          {icon}
                        </div>
                        <span className="text-text-secondary text-xs">{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {captureStatus === 'waiting' && (
                <div className="flex items-center justify-center gap-2 py-3 mb-4 bg-accent/5 border border-accent/20 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-accent text-xs font-medium">Aguardando captura da extensão...</span>
                </div>
              )}
              {captureStatus === 'success' && (
                <div className="flex items-center justify-center gap-2 py-3 mb-4 bg-accent/10 border border-accent/30 rounded-lg">
                  <CheckCircle size={15} className="text-accent" />
                  <span className="text-accent text-xs font-medium">Produto capturado! Avançando...</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowManual(!showManual)}
                className="w-full flex items-center justify-between text-xs text-text-secondary hover:text-text-primary transition-colors py-2 border-t border-border pt-4"
              >
                <span>ou preencha manualmente</span>
                {showManual ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showManual && (
                <div className="mt-3 space-y-3 animate-slide-up">
                  <Field label="Nome do produto" fieldKey="productName" placeholder="Nome do produto" />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Preço original (De)" fieldKey="originalPrice" placeholder="0.00" />
                    <Field label="Preço atual (Por) *" fieldKey="salePrice" placeholder="0.00" />
                    <Field label="Preço Pix" fieldKey="pixPrice" placeholder="0.00" />
                    <Field label="Desconto (%)" fieldKey="discountPercent" placeholder="0" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!fields.salePrice && !fields.productName}
                    className="btn-primary w-full text-sm"
                  >
                    Continuar com dados manuais
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — Revisar dados */}
          {step === 2 && (
            <div className="card animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center text-black text-xs font-bold flex-shrink-0">2</div>
                <h2 className="text-text-primary font-semibold text-sm">Revisar dados capturados</h2>
                {/* Platform badge */}
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                  detectPlatform(platform, affiliateLink) === 'mercadolivre'
                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                }`}>
                  {detectPlatform(platform, affiliateLink) === 'mercadolivre' ? '🛒 ML' : '🛍️ Shopee'}
                </span>
              </div>

              <div className="flex gap-4">
                {extensionImageUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={extensionImageUrl}
                      alt="Produto"
                      className="w-28 h-28 object-contain rounded-xl border border-border bg-white/5"
                    />
                  </div>
                )}

                <div className="flex-1 space-y-2.5">
                  <Field label="Nome do produto" fieldKey="productName" placeholder="Nome do produto" />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Preço original (De)" fieldKey="originalPrice" placeholder="0.00" />
                    <Field label="Preço atual (Por)" fieldKey="salePrice" placeholder="0.00" />
                    <Field label="Preço Pix" fieldKey="pixPrice" placeholder="0.00" />
                    <Field label="Desconto (%)" fieldKey="discountPercent" placeholder="0" />
                  </div>
                </div>
              </div>

              {/* ── Link afiliado ─────────────────────────────────────────── */}
              <div className="mt-4">
                <label className="label text-xs mb-1 block">Link de compra (afiliado)</label>
                <input
                  type="url"
                  value={affiliateLink}
                  onChange={(e) => { setAffiliateLink(e.target.value); setLinkError(''); }}
                  placeholder="Cole aqui seu link afiliado"
                  className="input text-sm w-full"
                />
                {linkError && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {linkError}
                  </p>
                )}
              </div>

              {/* ── Cupom section ─────────────────────────────────────────── */}
              <div className="mt-4 border border-border rounded-xl p-3 space-y-3">
                {/* Checkbox header */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={couponEnabled}
                    onChange={(e) => setCouponEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#00d96c] cursor-pointer"
                  />
                  <Tag size={14} className="text-accent" />
                  <span className="text-text-primary text-sm font-medium">Incluir cupom no anúncio</span>
                </label>

                {couponEnabled && (
                  <div className="space-y-3 animate-slide-up">
                    {/* Radio type */}
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="couponDisplayType"
                          value="code"
                          checked={couponDisplayType === 'code'}
                          onChange={() => setCouponDisplayType('code')}
                          className="accent-[#00d96c]"
                        />
                        <span className="text-text-secondary text-xs">Código do cupom</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="couponDisplayType"
                          value="link"
                          checked={couponDisplayType === 'link'}
                          onChange={() => setCouponDisplayType('link')}
                          className="accent-[#00d96c]"
                        />
                        <span className="text-text-secondary text-xs">Link de resgate</span>
                      </label>
                    </div>

                    {couponDisplayType === 'code' && (
                      <div>
                        <label className="text-text-secondary text-xs block mb-1">Código do cupom</label>
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="input text-sm font-mono tracking-widest"
                          placeholder="Ex: 5H3LBY"
                          maxLength={20}
                        />
                        {couponCode && (
                          <p className="text-text-secondary text-xs mt-1">
                            Aparecerá no anúncio: <span className="text-accent font-mono">Aplique o cupom 🎟️ {couponCode}</span>
                          </p>
                        )}
                      </div>
                    )}

                    {couponDisplayType === 'link' && (
                      <div className="space-y-2">
                        <div>
                          <label className="text-text-secondary text-xs block mb-1">Link de resgate do cupom</label>
                          <input
                            type="url"
                            value={couponLink}
                            onChange={(e) => { setCouponLink(e.target.value); setUseDefaultCouponLink(false); }}
                            className="input text-sm"
                            placeholder="https://s.shopee.com.br/..."
                          />
                        </div>
                        {defaultCouponLink && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useDefaultCouponLink}
                              onChange={(e) => setUseDefaultCouponLink(e.target.checked)}
                              className="w-3.5 h-3.5 accent-[#00d96c]"
                            />
                            <span className="text-text-secondary text-xs">
                              Usar meu link padrão
                              <span className="text-text-secondary/60 ml-1 font-mono text-xs">({defaultCouponLink.slice(0, 30)}...)</span>
                            </span>
                          </label>
                        )}
                        {!defaultCouponLink && (
                          <p className="text-text-secondary text-xs">
                            💡 Salve um link padrão em{' '}
                            <button onClick={() => navigate('/configuracoes')} className="text-accent underline">Configurações</button>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button type="button" onClick={() => setStep(1)} className="btn-secondary text-sm px-4">
                  <ArrowLeft size={15} />
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!affiliateLink.trim().startsWith('http')) {
                      setLinkError('Insira um link válido começando com http');
                      return;
                    }
                    setLinkError('');
                    setStep(3);
                  }}
                  disabled={!fields.salePrice && !fields.productName}
                  className="btn-primary flex-1 text-sm"
                >
                  Gerar Anúncio
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Link do produto */}
          {step === 3 && (
            <div className="card animate-fade-in">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center text-black text-xs font-bold flex-shrink-0">3</div>
                <h2 className="text-text-primary font-semibold text-sm">Link do produto</h2>
              </div>
              <p className="text-text-secondary text-xs mb-4">
                Link de compra do produto
              </p>

              <input
                type="url"
                value={affiliateLink}
                onChange={(e) => { setAffiliateLink(e.target.value); setLinkError(''); }}
                placeholder="Cole aqui o link afiliado do produto"
                className="input text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateAd()}
              />

              {linkError && (
                <div className="mt-2 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-xs">{linkError}</p>
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button type="button" onClick={() => setStep(2)} className="btn-secondary text-sm px-4">
                  <ArrowLeft size={15} />
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAd}
                  disabled={generating || !affiliateLink.trim()}
                  className="btn-primary flex-1 text-sm"
                >
                  {generating
                    ? <><Loader size={15} className="animate-spin" />Gerando...</>
                    : <><RefreshCw size={15} />Gerar Preview</>
                  }
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 — Mensagem + grupos */}
          {step === 4 && (
            <div className="space-y-5 animate-fade-in">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-accent rounded-full flex items-center justify-center text-black text-xs font-bold flex-shrink-0">4</div>
                    <h2 className="text-text-primary font-semibold text-sm">Mensagem gerada</h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      className="text-text-secondary hover:text-accent transition-colors p-1.5"
                      title="Gerar nova variação"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMode(!editMode)}
                      className={`text-sm px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                        editMode ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <Edit3 size={13} />
                      {editMode ? 'Salvar' : 'Editar'}
                    </button>
                  </div>
                </div>

                {editMode ? (
                  <textarea
                    value={adMessage}
                    onChange={(e) => setAdMessage(e.target.value)}
                    className="input font-mono text-xs min-h-48 resize-y leading-relaxed"
                    spellCheck={false}
                  />
                ) : (
                  <div className="bg-bg rounded-lg p-3 font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap border border-border">
                    {adMessage}
                  </div>
                )}
              </div>

              {waStatus !== 'ready' && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 mb-1">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-xs">
                    Conecte o WhatsApp em{' '}
                    <button onClick={() => navigate('/configuracoes')} className="underline font-medium">Configurações</button>{' '}
                    para sincronizar os grupos e disparar.
                  </p>
                </div>
              )}

              <div>
                <h2 className="text-text-primary font-semibold text-sm mb-3">Selecione os grupos</h2>
                <GroupSelector
                  groups={groups}
                  selected={selectedGroups}
                  onChange={setSelectedGroups}
                  maxGroups={maxGroups}
                />
              </div>

              <button type="button" onClick={() => setStep(3)} className="btn-secondary w-full text-sm">
                <ArrowLeft size={15} />
                Voltar e editar
              </button>
            </div>
          )}
        </div>

        {/* ── Right column: preview + dispatch ── */}
        <div className="space-y-5">
          <div>
            <h2 className="text-text-primary font-semibold text-sm mb-3">Preview da mensagem</h2>
            <AdPreview
              message={adMessage}
              imageUrl={extensionImageUrl}
              productName={fields.productName}
            />
          </div>

          {step === 4 && adMessage && selectedGroups.length > 0 && (
            <div className="card animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-text-primary font-semibold text-sm flex items-center gap-2">
                  <Send size={15} className="text-accent" />
                  Disparar Anúncio
                </h2>
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                  waStatus === 'ready'
                    ? 'bg-accent/10 text-accent'
                    : waStatus === 'qr' || waStatus === 'connecting' || waStatus === 'authenticated'
                    ? 'bg-yellow-500/10 text-yellow-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {waStatus === 'ready'
                    ? <><Wifi size={11} />🟢 Conectado</>
                    : waStatus === 'qr' || waStatus === 'connecting' || waStatus === 'authenticated'
                    ? <><Loader size={11} className="animate-spin" />🟡 Aguardando QR</>
                    : <><WifiOff size={11} />🔴 Desconectado</>
                  }
                </div>
              </div>

              {/* ── Agendamento rápido ── */}
              <div className="mb-4">
                <p className="text-text-secondary text-xs font-medium mb-2 flex items-center gap-1.5">
                  <Calendar size={13} />
                  Quando disparar?
                </p>
                <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                  {[
                    { key: 'now',        label: 'Agora' },
                    { key: '30min',      label: '30 min' },
                    { key: '1h',         label: '1 hora' },
                    { key: '2h',         label: '2 horas' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setScheduleOption(key)}
                      className={`py-1.5 px-1 rounded-lg text-xs font-medium transition-all border ${
                        scheduleOption === key
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-white/3 border-border text-text-secondary hover:text-text-primary hover:border-border/80'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {[
                    { key: 'tomorrow9',  label: 'Amanhã 9h' },
                    { key: 'nextweek9',  label: 'Próx. sem 9h' },
                    { key: 'custom',     label: '📅 Escolher' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setScheduleOption(key)}
                      className={`py-1.5 px-1 rounded-lg text-xs font-medium transition-all border ${
                        scheduleOption === key
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-white/3 border-border text-text-secondary hover:text-text-primary hover:border-border/80'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {scheduleOption === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="input text-sm"
                      min={new Date().toISOString().split('T')[0]}
                    />
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="input text-sm"
                    />
                  </div>
                )}
                <p className={`text-xs font-medium ${isScheduled ? 'text-yellow-400' : 'text-accent'}`}>
                  {scheduleDisplayText()}
                </p>
              </div>

              <div className="bg-bg rounded-lg px-3 py-2.5 mb-4 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Grupos:</span>
                  <span className="text-text-primary font-medium">{selectedGroups.length}</span>
                </div>
                {parsePrice(fields.salePrice) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Preço:</span>
                    <span className="text-accent font-medium">{fmt(fields.salePrice)}</span>
                  </div>
                )}
                {isScheduled && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Agendado:</span>
                    <span className="text-yellow-400 font-medium text-xs">
                      {scheduleDisplayText().replace('📅 ', '')}
                    </span>
                  </div>
                )}
              </div>

              {dispatching && (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader size={13} className="animate-spin text-accent flex-shrink-0" />
                    <span className="text-text-secondary text-sm">
                      Enviando para {selectedGroups.length} grupo{selectedGroups.length > 1 ? 's' : ''}...
                    </span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full w-2/3 animate-pulse" />
                  </div>
                </div>
              )}

              {dispatchResult && (
                <div className={`mb-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg ${
                  dispatchResult.success
                    ? 'bg-accent/10 border border-accent/20'
                    : 'bg-red-500/10 border border-red-500/20'
                }`}>
                  {dispatchResult.success
                    ? <CheckCircle size={16} className="text-accent flex-shrink-0 mt-0.5" />
                    : <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  }
                  <p className={`text-sm ${dispatchResult.success ? 'text-accent' : 'text-red-400'}`}>
                    {dispatchResult.success
                      ? dispatchResult.scheduled
                        ? '✅ Anúncio agendado com sucesso!'
                        : `✅ Enviado com sucesso!`
                      : dispatchResult.error}
                  </p>
                </div>
              )}

              {!dispatching && (
                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={!!dispatchResult?.success || (!isScheduled && waStatus !== 'ready') || (scheduleOption === 'custom' && (!customDate || !customTime))}
                  className={`w-full text-sm flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    isScheduled
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'btn-primary'
                  }`}
                  title={!isScheduled && waStatus !== 'ready' ? 'Conecte o WhatsApp em Configurações primeiro' : ''}
                >
                  {isScheduled ? <><Calendar size={16} />📅 Agendar Anúncio</> : <><Send size={16} />⚡ Disparar Agora</>}
                </button>
              )}
              {!isScheduled && waStatus !== 'ready' && !dispatching && (
                <button
                  type="button"
                  onClick={() => setShowWaWarning(true)}
                  className="mt-2 w-full text-xs text-red-400 hover:text-red-300 transition-colors flex items-center justify-center gap-1"
                >
                  <AlertCircle size={12} />
                  WhatsApp desconectado — clique para ver instruções
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
