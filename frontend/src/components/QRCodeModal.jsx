import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, RefreshCw, Wifi, WifiOff, Loader, Clock, AlertTriangle } from 'lucide-react';
import api from '../services/api';

const QR_TIMEOUT_SEC = 60; // QR expira em 60 segundos

function useCountdown(targetMs) {
  const [remaining, setRemaining] = useState(
    targetMs ? Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (!targetMs) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [targetMs]);

  return remaining;
}

export default function QRCodeModal({ onClose, onConnected }) {
  const [status, setStatus]             = useState('connecting');
  const [qrImage, setQrImage]           = useState(null);
  const [error, setError]               = useState(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(null);
  const [qrExpiresAt, setQrExpiresAt]   = useState(null);
  const [qrExpired, setQrExpired]       = useState(false);
  const wsRef    = useRef(null);
  const qrTimerRef = useRef(null);

  const rateLimitCountdown = useCountdown(rateLimitedUntil);
  const qrCountdown        = useCountdown(qrExpiresAt);

  // ── Iniciar QR timer quando QR aparecer ──────────────────────────────────────
  const startQrTimer = useCallback(() => {
    setQrExpired(false);
    setQrExpiresAt(Date.now() + QR_TIMEOUT_SEC * 1000);

    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    qrTimerRef.current = setTimeout(() => {
      setQrExpired(true);
    }, QR_TIMEOUT_SEC * 1000);
  }, []);

  // ── Conectar ao backend + WebSocket ─────────────────────────────────────────
  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    setQrImage(null);
    setQrExpired(false);
    setQrExpiresAt(null);
    setRateLimitedUntil(null);

    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);

    try {
      await api.post('/whatsapp/connect');
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 429 && data?.rateLimitedUntil) {
        setRateLimitedUntil(data.rateLimitedUntil);
        setStatus('rate_limited');
      } else {
        setError(data?.error || 'Erro ao iniciar conexão');
        setStatus('error');
      }
      return;
    }

    // WebSocket para receber QR em tempo real
    const token  = localStorage.getItem('accessToken');
    const proto  = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl  = `${proto}://${window.location.host}/ws/whatsapp?token=${token}`;

    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === 'qr' && data.qr) {
          setQrImage(data.qr);
          setStatus('qr');
          startQrTimer();
        } else if (data.status === 'ready') {
          if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
          setQrImage(null);
          setStatus('ready');
          onConnected?.();
          setTimeout(() => onClose?.(), 1500);
        } else if (data.status === 'authenticated') {
          setStatus('authenticated');
        } else if (data.status === 'rate_limited') {
          if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
          setRateLimitedUntil(data.until);
          setStatus('rate_limited');
        } else if (data.status === 'auth_failure') {
          if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
          setError('Falha na autenticação. Tente novamente.');
          setStatus('error');
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      setError('Erro na conexão WebSocket');
      setStatus('error');
    };
  }, [onClose, onConnected, startQrTimer]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Formato de tempo legível ──────────────────────────────────────────────
  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-text-primary font-bold text-lg">Conectar WhatsApp</h2>
            <p className="text-text-secondary text-sm mt-0.5">
              Escaneie o QR Code com seu celular
            </p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col items-center gap-4">

          {/* Conectando */}
          {status === 'connecting' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader size={32} className="text-accent animate-spin" />
              <p className="text-text-secondary text-sm">Iniciando cliente WhatsApp...</p>
              <p className="text-text-secondary text-xs text-center opacity-70">
                Não feche esta janela durante a conexão
              </p>
            </div>
          )}

          {/* QR Code */}
          {status === 'qr' && qrImage && !qrExpired && (
            <>
              <div className="relative">
                <div className="p-3 bg-white rounded-xl">
                  <img src={qrImage} alt="QR Code WhatsApp" className="w-52 h-52" />
                </div>
                {/* Countdown overlay */}
                {qrCountdown > 0 && (
                  <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold shadow-lg ${
                    qrCountdown <= 15
                      ? 'bg-red-500 text-white'
                      : qrCountdown <= 30
                      ? 'bg-yellow-500 text-black'
                      : 'bg-card border border-border text-text-secondary'
                  }`}>
                    <Clock size={11} />
                    Expira em {formatCountdown(qrCountdown)}
                  </div>
                )}
              </div>

              <div className="text-center mt-3 space-y-1">
                <p className="text-text-primary text-sm font-medium">1. Abra o WhatsApp no celular</p>
                <p className="text-text-secondary text-sm">2. Toque em <strong>Mais opções</strong> → <strong>Aparelhos conectados</strong></p>
                <p className="text-text-secondary text-sm">3. Toque em <strong>Conectar um aparelho</strong></p>
                <p className="text-text-secondary text-sm">4. Aponte a câmera para o QR Code acima</p>
              </div>

              <div className="w-full flex items-center gap-2 bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 mt-1">
                <AlertTriangle size={13} className="text-accent flex-shrink-0" />
                <p className="text-accent text-xs">Não feche esta janela durante a conexão</p>
              </div>
            </>
          )}

          {/* QR expirado */}
          {status === 'qr' && qrExpired && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="w-14 h-14 bg-yellow-500/10 rounded-full flex items-center justify-center">
                <Clock size={28} className="text-yellow-400" />
              </div>
              <div>
                <p className="text-yellow-400 text-sm font-semibold">QR Code expirou</p>
                <p className="text-text-secondary text-xs mt-1">Gere um novo para continuar</p>
              </div>
              <button onClick={connect} className="btn-primary text-sm gap-2">
                <RefreshCw size={14} />
                Gerar novo QR
              </button>
            </div>
          )}

          {/* Autenticando */}
          {(status === 'authenticated') && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader size={32} className="text-yellow-400 animate-spin" />
              <p className="text-yellow-400 text-sm font-medium">Autenticando...</p>
            </div>
          )}

          {/* Conectado */}
          {status === 'ready' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 bg-accent/20 rounded-full flex items-center justify-center">
                <Wifi size={28} className="text-accent" />
              </div>
              <p className="text-accent text-sm font-semibold">WhatsApp Conectado!</p>
            </div>
          )}

          {/* Rate limited */}
          {status === 'rate_limited' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <div>
                <p className="text-red-400 text-sm font-semibold">WhatsApp bloqueou temporariamente</p>
                <p className="text-text-secondary text-xs mt-1">
                  Muitas tentativas de conexão em pouco tempo.<br />Aguarde para tentar novamente.
                </p>
              </div>
              {rateLimitCountdown > 0 ? (
                <div className="w-full bg-red-500/10 border border-red-500/20 rounded-xl py-4">
                  <p className="text-text-secondary text-xs mb-1">Libera em</p>
                  <p className="text-red-400 text-2xl font-mono font-bold">
                    {formatCountdown(rateLimitCountdown)}
                  </p>
                </div>
              ) : (
                <button onClick={connect} className="btn-primary text-sm gap-2">
                  <RefreshCw size={14} />
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          {/* Erro genérico */}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <WifiOff size={32} className="text-red-400" />
              <p className="text-red-400 text-sm">{error || 'Erro desconhecido'}</p>
              <button onClick={connect} className="btn-secondary text-sm gap-2">
                <RefreshCw size={14} />
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {/* Status indicator */}
        <div className="mt-5 pt-4 border-t border-border flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            status === 'ready'        ? 'bg-accent' :
            status === 'qr' || status === 'authenticated' ? 'bg-yellow-400' :
            status === 'rate_limited' ? 'bg-red-400' :
            status === 'error'        ? 'bg-red-400' :
            'bg-text-secondary animate-pulse'
          }`} />
          <span className="text-text-secondary text-xs">
            {status === 'qr' && !qrExpired ? 'Aguardando leitura do QR' :
             status === 'qr' && qrExpired  ? 'QR expirado' :
             status === 'ready'            ? 'Conectado' :
             status === 'authenticated'    ? 'Autenticando' :
             status === 'rate_limited'     ? 'Bloqueado temporariamente' :
             status === 'error'            ? 'Erro' : 'Conectando'}
          </span>
        </div>
      </div>
    </div>
  );
}
