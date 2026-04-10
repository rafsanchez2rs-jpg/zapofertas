import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, RefreshCw, Wifi, WifiOff, Loader, Clock, AlertTriangle } from 'lucide-react';
import axios from 'axios';

const POLL_MS        = 6000;  // intervalo de polling
const QR_TIMEOUT_SEC = 60;    // QR expira em 60 segundos
const MAX_WAIT_SEC   = 120;   // desiste após 2 minutos

// Axios dedicado para WhatsApp com timeout longo (Evolution API cold start)
const waApi = axios.create({
  baseURL: '/api',
  timeout: 70000,
  headers: { 'Content-Type': 'application/json' },
});
waApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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

const WARM_MESSAGES = [
  'Obtendo QR Code...',
  'Iniciando serviço WhatsApp...',
  'Aguardando Evolution API...',
  'Pode levar até 1 minuto na primeira vez...',
  'Ainda aguardando, quase lá...',
];

export default function QRCodeModal({ onClose, onConnected }) {
  const [status, setStatus]           = useState('connecting');
  const [qrImage, setQrImage]         = useState(null);
  const [error, setError]             = useState(null);
  const [qrExpiresAt, setQrExpiresAt] = useState(null);
  const [qrExpired, setQrExpired]     = useState(false);
  const [warmMsg, setWarmMsg]         = useState(WARM_MESSAGES[0]);
  const [attemptCount, setAttemptCount] = useState(0);
  const pollRef    = useRef(null);
  const qrTimerRef = useRef(null);
  const startedAt  = useRef(null);
  const attemptsRef = useRef(0);

  const qrCountdown = useCountdown(qrExpiresAt);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
  };

  const startQrTimer = useCallback(() => {
    setQrExpired(false);
    setQrExpiresAt(Date.now() + QR_TIMEOUT_SEC * 1000);
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    qrTimerRef.current = setTimeout(() => setQrExpired(true), QR_TIMEOUT_SEC * 1000);
  }, []);

  const connect = useCallback(async () => {
    stopPolling();
    setStatus('connecting');
    setError(null);
    setQrImage(null);
    setQrExpired(false);
    setQrExpiresAt(null);
    attemptsRef.current = 0;
    startedAt.current = Date.now();
    setAttemptCount(0);
    setWarmMsg(WARM_MESSAGES[0]);

    const fetchQr = async () => {
      attemptsRef.current += 1;
      setAttemptCount(attemptsRef.current);
      const msgIdx = Math.min(attemptsRef.current - 1, WARM_MESSAGES.length - 1);
      setWarmMsg(WARM_MESSAGES[msgIdx]);

      // Desiste após MAX_WAIT_SEC
      if (Date.now() - startedAt.current > MAX_WAIT_SEC * 1000) {
        stopPolling();
        setStatus('error');
        setError('Tempo esgotado. O serviço WhatsApp pode estar indisponível. Tente novamente.');
        return;
      }

      try {
        const { data } = await waApi.get('/whatsapp/qrcode');
        if (data?.connected) {
          // Já conectado — fecha o modal
          stopPolling();
          setStatus('ready');
          onConnected?.();
          setTimeout(() => onClose?.(), 1500);
          return;
        }
        if (data?.qr) {
          setQrImage(data.qr);
          startQrTimer();
          setStatus('qr');
        }
        // 202 = aguardando QR, 503 = Evolution API acordando — continua tentando
      } catch {
        // continua tentando (503, timeout, etc)
      }
    };

    const checkStatus = async () => {
      try {
        const { data } = await waApi.get('/whatsapp/status');
        if (data?.status === 'ready') {
          stopPolling();
          setStatus('ready');
          onConnected?.();
          setTimeout(() => onClose?.(), 1500);
          return true;
        }
      } catch {
        // ignora
      }
      return false;
    };

    await fetchQr();

    pollRef.current = setInterval(async () => {
      const connected = await checkStatus();
      if (!connected) await fetchQr();
    }, POLL_MS);
  }, [onClose, onConnected, startQrTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connect();
    return stopPolling;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
              <p className="text-text-secondary text-sm text-center">{warmMsg}</p>
              {attemptCount > 1 && (
                <p className="text-text-secondary text-xs text-center opacity-60">
                  Tentativa {attemptCount} — aguarde, o serviço está iniciando
                </p>
              )}
            </div>
          )}

          {/* QR Code */}
          {status === 'qr' && qrImage && !qrExpired && (
            <>
              <div className="relative">
                <div className="p-3 bg-white rounded-xl">
                  <img src={qrImage} alt="QR Code WhatsApp" className="w-52 h-52" />
                </div>
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

          {/* Conectado */}
          {status === 'ready' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 bg-accent/20 rounded-full flex items-center justify-center">
                <Wifi size={28} className="text-accent" />
              </div>
              <p className="text-accent text-sm font-semibold">WhatsApp Conectado!</p>
            </div>
          )}

          {/* Erro */}
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
            status === 'ready'  ? 'bg-accent' :
            status === 'qr'     ? 'bg-yellow-400' :
            status === 'error'  ? 'bg-red-400' :
            'bg-text-secondary animate-pulse'
          }`} />
          <span className="text-text-secondary text-xs">
            {status === 'qr' && !qrExpired ? 'Aguardando leitura do QR' :
             status === 'qr' && qrExpired  ? 'QR expirado' :
             status === 'ready'            ? 'Conectado' :
             status === 'error'            ? 'Erro' : 'Conectando'}
          </span>
        </div>
      </div>
    </div>
  );
}
