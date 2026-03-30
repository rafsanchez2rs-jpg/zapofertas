import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Wifi, WifiOff, QrCode,
  Save, Loader, CheckCircle, User, Shield, Clock,
  Image, RefreshCw, AlertCircle, Tag,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import QRCodeModal from '../components/QRCodeModal';

export default function Settings() {
  const { user } = useAuth();
  const [waStatus, setWaStatus] = useState('disconnected');
  const [showQR, setShowQR] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [settings, setSettings] = useState({
    delay_between_sends: 3000,
    send_image: true,
    auto_reconnect: true,
    coupon_default_link: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');

  // Countdown timer para rate limit
  useEffect(() => {
    if (!rateLimitedUntil) { setRateLimitCountdown(0); return; }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
      setRateLimitCountdown(secs);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [rateLimitedUntil]);

  const fmtCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, waRes] = await Promise.all([
          api.get('/whatsapp/settings'),
          api.get('/whatsapp/status'),
        ]);
        setSettings({
          delay_between_sends: settingsRes.data.settings.delay_between_sends,
          send_image: !!settingsRes.data.settings.send_image,
          auto_reconnect: !!settingsRes.data.settings.auto_reconnect,
          coupon_default_link: settingsRes.data.settings.coupon_default_link || '',
        });
        setWaStatus(waRes.data.status);
        if (waRes.data.rateLimitedUntil) {
          setRateLimitedUntil(waRes.data.rateLimitedUntil);
        }
      } catch {
        setError('Erro ao carregar configurações');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/whatsapp/settings', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o WhatsApp? Você precisará escanear o QR Code novamente.')) return;
    setDisconnecting(true);
    try {
      await api.post('/whatsapp/disconnect');
      setWaStatus('disconnected');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = waStatus === 'ready';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Configurações</h1>
        <p className="text-text-secondary text-sm mt-1">Gerencie sua conta e conexão WhatsApp</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-400">×</button>
        </div>
      )}

      {/* Account Info */}
      <div className="card space-y-3">
        <h2 className="text-text-primary font-semibold text-sm flex items-center gap-2">
          <User size={15} className="text-accent" />
          Conta
        </h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-bg rounded-lg px-3 py-2.5">
            <p className="text-text-secondary text-xs">Email</p>
            <p className="text-text-primary font-medium mt-0.5">{user?.email}</p>
          </div>
          <div className="bg-bg rounded-lg px-3 py-2.5">
            <p className="text-text-secondary text-xs">Plano</p>
            <p className={`font-bold mt-0.5 ${user?.plan === 'pro' ? 'text-accent' : 'text-text-primary'}`}>
              {user?.plan === 'pro' ? 'PRO ✨' : 'Free'}
            </p>
          </div>
        </div>

        {user?.plan === 'free' && (
          <div className="bg-accent/5 border border-accent/20 rounded-lg px-3 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className="text-accent" />
              <span className="text-accent text-sm font-semibold">Faça upgrade para Pro</span>
            </div>
            <p className="text-text-secondary text-xs">
              Plano Free: 3 grupos e 10 disparos/dia. Pro: grupos e disparos ilimitados.
            </p>
          </div>
        )}
      </div>

      {/* WhatsApp Connection */}
      <div className="card space-y-4">
        <h2 className="text-text-primary font-semibold text-sm flex items-center gap-2">
          <QrCode size={15} className="text-accent" />
          Conexão WhatsApp
        </h2>

        {/* Status */}
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
          isConnected ? 'bg-accent/5 border-accent/20' : 'bg-red-500/5 border-red-500/20'
        }`}>
          <div className="flex items-center gap-3">
            {isConnected ? (
              <Wifi size={18} className="text-accent" />
            ) : (
              <WifiOff size={18} className="text-red-400" />
            )}
            <div>
              <p className={`text-sm font-semibold ${isConnected ? 'text-accent' : 'text-red-400'}`}>
                {isConnected ? 'Conectado' :
                 waStatus === 'qr' ? 'Aguardando QR' :
                 waStatus === 'authenticated' ? 'Autenticando...' :
                 'Desconectado'}
              </p>
              <p className="text-text-secondary text-xs">
                {isConnected ? 'WhatsApp pronto para envios' : 'Conecte para enviar anúncios'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {isConnected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="btn-danger text-xs py-1.5 px-3"
              >
                {disconnecting ? <Loader size={12} className="animate-spin" /> : <WifiOff size={12} />}
                Desconectar
              </button>
            ) : rateLimitedUntil && rateLimitCountdown > 0 ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                  <Clock size={12} className="text-red-400" />
                  <span className="text-red-400 text-xs font-mono font-semibold">
                    {fmtCountdown(rateLimitCountdown)}
                  </span>
                </div>
                <p className="text-text-secondary text-xs">Bloqueado temporariamente</p>
              </div>
            ) : (
              <button
                onClick={() => setShowQR(true)}
                className="btn-primary text-xs py-1.5 px-3"
              >
                <QrCode size={12} />
                Conectar via QR
              </button>
            )}
          </div>
        </div>

        <div className="text-text-secondary text-xs space-y-1 pl-1">
          <p>• Abra o WhatsApp no celular → Mais opções → Aparelhos conectados</p>
          <p>• Toque em "Conectar um aparelho" e escaneie o QR Code</p>
          <p>• A sessão é salva localmente — não precisa reconectar a cada uso</p>
        </div>
      </div>

      {/* Send Settings */}
      <div className="card space-y-4">
        <h2 className="text-text-primary font-semibold text-sm flex items-center gap-2">
          <SettingsIcon size={15} className="text-accent" />
          Configurações de envio
        </h2>

        {/* Delay */}
        <div>
          <label className="label flex items-center gap-2">
            <Clock size={13} />
            Delay entre grupos
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1000}
              max={15000}
              step={500}
              value={settings.delay_between_sends}
              onChange={(e) => setSettings({ ...settings, delay_between_sends: Number(e.target.value) })}
              className="flex-1 accent-[#00d96c]"
            />
            <span className="text-text-primary text-sm font-mono w-16 text-right">
              {(settings.delay_between_sends / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="text-text-secondary text-xs mt-1">
            Delay mínimo de 3s recomendado para evitar bloqueio pelo WhatsApp
          </p>
        </div>

        {/* Send Image */}
        <div className="flex items-center justify-between py-3 border-t border-border">
          <div className="flex items-start gap-3">
            <Image size={15} className="text-text-secondary mt-0.5" />
            <div>
              <p className="text-text-primary text-sm font-medium">Enviar imagem do produto</p>
              <p className="text-text-secondary text-xs mt-0.5">
                Envia a foto junto com a mensagem (quando disponível)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, send_image: !settings.send_image })}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
              settings.send_image ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                settings.send_image ? 'translate-x-5.5' : 'translate-x-0.5'
              }`}
              style={{ transform: settings.send_image ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>

        {/* Auto Reconnect */}
        <div className="flex items-center justify-between py-3 border-t border-border">
          <div className="flex items-start gap-3">
            <RefreshCw size={15} className="text-text-secondary mt-0.5" />
            <div>
              <p className="text-text-primary text-sm font-medium">Reconexão automática</p>
              <p className="text-text-secondary text-xs mt-0.5">
                Tenta reconectar automaticamente se o WhatsApp cair
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, auto_reconnect: !settings.auto_reconnect })}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
              settings.auto_reconnect ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
              style={{ transform: settings.auto_reconnect ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>

        {/* Coupon default link */}
        <div className="py-3 border-t border-border">
          <label className="label flex items-center gap-2 mb-2">
            <Tag size={13} />
            Link padrão do cupom
          </label>
          <input
            type="url"
            value={settings.coupon_default_link}
            onChange={(e) => setSettings({ ...settings, coupon_default_link: e.target.value })}
            className="input text-sm"
            placeholder="https://s.shopee.com.br/..."
          />
          <p className="text-text-secondary text-xs mt-1">
            Preenchido automaticamente no editor de anúncios ao usar "Link de resgate"
          </p>
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? (
            <Loader size={15} className="animate-spin" />
          ) : saved ? (
            <>
              <CheckCircle size={15} />
              Salvo!
            </>
          ) : (
            <>
              <Save size={15} />
              Salvar configurações
            </>
          )}
        </button>
      </div>

      {/* QR Modal */}
      {showQR && (
        <QRCodeModal
          onClose={() => setShowQR(false)}
          onConnected={() => setWaStatus('ready')}
        />
      )}
    </div>
  );
}
