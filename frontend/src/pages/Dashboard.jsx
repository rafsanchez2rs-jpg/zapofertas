import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

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
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Zap, Users, TrendingUp, ShoppingBag,
  ArrowRight, Wifi, WifiOff, PlusCircle,
  CheckCircle, Phone, Clock, BarChart2,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

function StatCard({ icon: Icon, label, value, sub, color = 'accent' }) {
  const colorMap = {
    accent: 'text-accent bg-accent/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    green: 'text-green-400 bg-green-400/10',
  };

  return (
    <div className="card flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-text-secondary text-xs font-medium">{label}</p>
        <p className="text-text-primary text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-text-secondary text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm">
        <p className="text-text-secondary">{label}</p>
        <p className="text-accent font-semibold">{payload[0].value} disparos</p>
      </div>
    );
  }
  return null;
};

function buildChartData(last14Days) {
  if (!last14Days) return [];
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    const found = last14Days.find((x) => x.day === dayStr);
    days.push({
      day: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count: found?.count || 0,
    });
  }
  return days;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [waStatus, setWaStatus] = useState({ status: 'disconnected', phone: null, connectedSince: null });
  const [loading, setLoading] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, waRes] = await Promise.all([
          api.get('/campaigns/stats'),
          api.get('/whatsapp/status'),
        ]);
        setStats(statsRes.data);
        setWaStatus(waRes.data);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleResetMetrics = async () => {
    setResetting(true);
    try {
      await api.post('/dashboard/reset-metrics');
      const [statsRes] = await Promise.all([api.get('/campaigns/stats')]);
      setStats(statsRes.data);
      setShowResetModal(false);
      showToast('✅ Métricas zeradas com sucesso');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao zerar métricas');
    } finally {
      setResetting(false);
    }
  };

  const chartData = buildChartData(stats?.last14Days);
  const isConnected = waStatus.status === 'ready';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6 animate-fade-in">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-card border border-accent/30 text-accent text-sm font-medium px-4 py-3 rounded-xl shadow-lg animate-slide-up">
          {toast}
        </div>
      )}

      {/* Modal zerar métricas */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm animate-slide-up">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-text-primary font-bold text-base mb-1">Zerar métricas?</h3>
                <p className="text-text-secondary text-sm">Isso vai zerar todas as métricas do dashboard. O histórico de campanhas será mantido.</p>
              </div>
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetting}
                  className="btn-secondary flex-1 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleResetMetrics}
                  disabled={resetting}
                  className="flex-1 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {resetting ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            Olá, {user?.name || 'Usuário'} 👋
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowResetModal(true)}
            className="btn-secondary text-sm text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} />
            Zerar métricas
          </button>
          <Link to="/novo-anuncio" className="btn-primary">
            <PlusCircle size={16} />
            Novo Anúncio
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Zap} label="Disparos hoje" value={stats?.today ?? 0} color="accent" />
        <StatCard icon={TrendingUp} label="Esta semana" value={stats?.week ?? 0} color="blue" />
        <StatCard icon={Users} label="Grupos ativos" value={stats?.activeGroups ?? 0} color="yellow" />
        <StatCard icon={CheckCircle} label="Taxa de sucesso" value={`${stats?.successRate ?? 0}%`} color="green" />
      </div>

      {/* Chart + WA Status */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card">
          <h2 className="text-text-primary font-semibold text-sm mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-accent" />
            Disparos — Últimos 14 dias
          </h2>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d96c" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d96c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,217,108,0.2)' }} />
                <Area type="monotone" dataKey="count" stroke="#00d96c" strokeWidth={2} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card space-y-3">
          <h2 className="text-text-primary font-semibold text-sm flex items-center gap-2">
            {isConnected ? <Wifi size={15} className="text-accent" /> : <WifiOff size={15} className="text-red-400" />}
            WhatsApp
          </h2>
          <div className={`px-3 py-2.5 rounded-lg border ${isConnected ? 'bg-accent/5 border-accent/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <p className={`text-sm font-bold ${isConnected ? 'text-accent' : 'text-red-400'}`}>
              {isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
            </p>
          </div>
          {isConnected && waStatus.phone && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Phone size={12} />
              <span>+55 {waStatus.phone}</span>
            </div>
          )}
          {isConnected && waStatus.connectedSince && (
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Clock size={12} />
              <span>Conectado desde {new Date(waStatus.connectedSince).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          {!isConnected && (
            <Link to="/configuracoes" className="btn-primary text-sm py-2 w-full justify-center">
              Reconectar <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-text-primary font-semibold text-sm mb-3 flex items-center gap-2">
            <ShoppingBag size={15} className="text-accent" />
            Top 5 produtos disparados
          </h2>
          {stats?.topProducts?.length > 0 ? (
            <div className="space-y-2">
              {stats.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-text-secondary text-xs w-4 flex-shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <p className="text-text-primary text-xs font-medium truncate">{p.product_name}</p>
                      <span className={`text-xs ${p.platform === 'shopee' ? 'text-orange-400' : 'text-yellow-400'}`}>
                        {p.platform === 'shopee' ? 'Shopee' : 'Mercado Livre'}
                      </span>
                    </div>
                  </div>
                  <span className="text-accent text-xs font-bold flex-shrink-0 ml-2">{p.total}×</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary text-xs text-center py-6">Nenhum dado ainda</p>
          )}
        </div>

        <div className="card">
          <h2 className="text-text-primary font-semibold text-sm mb-3 flex items-center gap-2">
            <Users size={15} className="text-accent" />
            Grupos mais ativos
          </h2>
          {stats?.topGroups?.length > 0 ? (
            <div className="space-y-2">
              {stats.topGroups.map((g, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-text-secondary text-xs w-4 flex-shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <p className="text-text-primary text-xs font-medium truncate">{g.group_name}</p>
                      {g.last_sent && <p className="text-text-secondary text-xs">{new Date(g.last_sent).toLocaleDateString('pt-BR')}</p>}
                    </div>
                  </div>
                  <span className="text-accent text-xs font-bold flex-shrink-0 ml-2">{g.total} msgs</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary text-xs text-center py-6">Nenhum dado ainda</p>
          )}
        </div>
      </div>

      {/* Último Anúncio */}
      {stats?.lastAd && (
        <div className="card">
          <h2 className="text-text-primary font-semibold text-sm mb-3 flex items-center gap-2">
            <Clock size={15} className="text-accent" />
            Último Anúncio
          </h2>
          <div className="flex gap-4">
            {stats.lastAd.image_url && (
              <img
                src={stats.lastAd.image_url}
                alt={stats.lastAd.product_name}
                className="w-20 h-20 object-cover rounded-xl flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className="space-y-1">
              <p className="text-text-primary text-sm font-semibold">{stats.lastAd.product_name}</p>
              <div className="flex items-center gap-2">
                <span className={`badge text-xs ${detectPlatform(stats.lastAd.platform, stats.lastAd.product_url) === 'shopee' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 border' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 border'}`}>
                  {detectPlatform(stats.lastAd.platform, stats.lastAd.product_url) === 'shopee' ? 'Shopee' : 'Mercado Livre'}
                </span>
                <span className={`badge text-xs ${stats.lastAd.status === 'sent' ? 'badge-green' : stats.lastAd.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                  {stats.lastAd.status === 'sent' ? '✅ Enviado' : stats.lastAd.status === 'failed' ? '❌ Falhou' : '⏳ ' + stats.lastAd.status}
                </span>
              </div>
              {stats.lastAd.sale_price && (
                <p className="text-text-secondary text-xs">
                  R$ {stats.lastAd.sale_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
              <p className="text-text-secondary text-xs">
                {new Date(stats.lastAd.created_at).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
