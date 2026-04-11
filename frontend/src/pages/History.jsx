import React, { useState, useEffect } from 'react';
import {
  History as HistoryIcon, RefreshCw,
  ExternalLink, RotateCcw, Loader, Filter, Trash2, AlertTriangle,
} from 'lucide-react';
import api from '../services/api';

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

const STATUS_CONFIG = {
  sent:      { label: '✅ Enviado',    cls: 'badge-green' },
  partial:   { label: '⚠️ Parcial',   cls: 'badge-yellow' },
  failed:    { label: '❌ Falhou',     cls: 'badge-red' },
  pending:   { label: '⏳ Pendente',   cls: 'badge-gray' },
  sending:   { label: '📤 Enviando',  cls: 'badge-yellow' },
  scheduled: { label: '🕐 Agendado',  cls: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
  cancelled: { label: '🚫 Cancelado', cls: 'badge-gray' },
};

const STATUS_FILTERS = [
  { value: 'all',       label: 'Todos' },
  { value: 'sent',      label: '✅ Enviados' },
  { value: 'scheduled', label: '🕐 Agendados' },
  { value: 'failed',    label: '❌ Falhos' },
];

const PLATFORM_FILTERS = [
  { value: 'all',          label: 'Todas' },
  { value: 'shopee',       label: '🛍️ Shopee' },
  { value: 'mercadolivre', label: '🛒 Mercado Livre' },
];

export default function History() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [resending, setResending] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [groupDetails, setGroupDetails] = useState({});
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [toast, setToast] = useState(null);

  const loadHistory = async (sf, pf) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sf && sf !== 'all') params.append('status', sf);
      if (pf && pf !== 'all') params.append('platform', pf);

      console.log('[History] Enviando filtros:', { status: sf, platform: pf });

      const { data } = await api.get(`/campaigns/history?${params}`);
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Erro histórico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(statusFilter, platformFilter);
  }, [statusFilter, platformFilter]);

  const handleResend = async (id) => {
    setResending(id);
    try {
      await api.post(`/campaigns/${id}/resend`);
      setTimeout(() => loadHistory(statusFilter, platformFilter), 2000);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao reenviar');
    } finally {
      setResending(null);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancelar este agendamento?')) return;
    setCancelling(id);
    try {
      await api.patch(`/campaigns/${id}/cancel`);
      setTimeout(() => loadHistory(statusFilter, platformFilter), 500);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao cancelar agendamento');
    } finally {
      setCancelling(null);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleClearHistory = async () => {
    setClearing(true);
    try {
      await api.delete('/campaigns/history/all');
      setCampaigns([]);
      setShowClearModal(false);
      showToast('✅ Histórico limpo com sucesso');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao limpar histórico');
    } finally {
      setClearing(false);
    }
  };

  const loadGroupDetails = async (id) => {
    if (groupDetails[id]) return;
    try {
      const { data } = await api.get(`/campaigns/${id}`);
      setGroupDetails((prev) => ({ ...prev, [id]: data.groups }));
    } catch {}
  };

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadGroupDetails(id);
    }
  };

  const fmt = (v) =>
    v != null
      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—';

  return (
    <div className="max-w-6xl animate-fade-in space-y-5">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-card border border-accent/30 text-accent text-sm font-medium px-4 py-3 rounded-xl shadow-lg animate-slide-up">
          {toast}
        </div>
      )}

      {/* Modal limpar histórico */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm animate-slide-up">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-text-primary font-bold text-base mb-1">Limpar histórico?</h3>
                <p className="text-text-secondary text-sm">Esta ação não pode ser desfeita.</p>
              </div>
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  disabled={clearing}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={clearing}
                  className="flex-1 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {clearing ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Histórico</h1>
          <p className="text-text-secondary text-sm mt-1">{campaigns.length} disparos registrados</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadHistory(statusFilter, platformFilter)}
            disabled={loading}
            className="btn-secondary text-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={() => setShowClearModal(true)}
            className="btn-secondary text-sm text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} />
            Limpar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-text-secondary flex-shrink-0" />
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                statusFilter === value
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-white/3 border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}

          <div className="w-px h-4 bg-border mx-1" />

          {PLATFORM_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPlatformFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                platformFilter === value
                  ? 'bg-accent/15 border-accent/40 text-accent'
                  : 'bg-white/3 border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader size={24} className="animate-spin text-accent" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <HistoryIcon size={32} className="text-border mb-3" />
            <p className="text-text-secondary text-sm">Nenhum disparo encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Produto</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Plataforma</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Preço</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Grupos</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Status</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Data</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const statusConf = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
                  const isExpanded = expandedId === c.id;

                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        className="border-b border-border hover:bg-white/2 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(c.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {c.image_url && (
                              <img
                                src={c.image_url}
                                alt={c.product_name}
                                className="w-9 h-9 object-cover rounded-lg flex-shrink-0"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            )}
                            <span className="text-text-primary text-sm font-medium max-w-[200px] truncate">
                              {c.product_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge text-xs ${detectPlatform(c.platform, c.product_url) === 'shopee' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                            {detectPlatform(c.platform, c.product_url) === 'shopee' ? 'Shopee' : 'ML'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-accent text-sm font-medium">
                          {fmt(c.sale_price)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-text-primary text-sm">
                            {c.groups_sent ?? 0}/{c.groups_total ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge ${statusConf.cls}`}>{statusConf.label}</span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                          {c.status === 'scheduled' && c.scheduled_at ? (
                            <span className="text-blue-400">
                              Agendado: {new Date(c.scheduled_at).toLocaleString('pt-BR', {
                                timeZone: 'America/Sao_Paulo',
                                day: '2-digit', month: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          ) : (
                            new Date(c.created_at).toLocaleString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                              day: '2-digit', month: '2-digit',
                              hour: '2-digit', minute: '2-digit',
                            })
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {c.product_url && (
                              <a
                                href={c.product_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-text-secondary hover:text-accent transition-colors p-1"
                                title="Abrir produto"
                              >
                                <ExternalLink size={13} />
                              </a>
                            )}
                            {(c.status === 'failed' || c.status === 'partial') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleResend(c.id); }}
                                disabled={resending === c.id}
                                className="text-text-secondary hover:text-accent transition-colors p-1"
                                title="Reenviar"
                              >
                                {resending === c.id
                                  ? <Loader size={13} className="animate-spin" />
                                  : <RotateCcw size={13} />
                                }
                              </button>
                            )}
                            {c.status === 'scheduled' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCancel(c.id); }}
                                disabled={cancelling === c.id}
                                className="text-text-secondary hover:text-red-400 transition-colors p-1"
                                title="Cancelar agendamento"
                              >
                                {cancelling === c.id
                                  ? <Loader size={13} className="animate-spin" />
                                  : <Trash2 size={13} />
                                }
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded group details */}
                      {isExpanded && (
                        <tr className="bg-bg">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="space-y-2">
                              <p className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                                Status por grupo
                              </p>
                              {groupDetails[c.id] ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {groupDetails[c.id].map((g) => (
                                    <div key={g.id} className="flex items-center gap-2 bg-card rounded-lg px-2.5 py-2">
                                      <span className={g.status === 'sent' ? 'text-accent' : g.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                                        {g.status === 'sent' ? '✅' : g.status === 'failed' ? '❌' : '⏳'}
                                      </span>
                                      <span className="text-text-primary text-xs truncate">{g.group_name}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <Loader size={14} className="animate-spin text-accent" />
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
