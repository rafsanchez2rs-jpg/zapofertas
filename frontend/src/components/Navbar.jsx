import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PlusCircle, Users, History,
  Settings, LogOut, Zap, Wifi, WifiOff, Shield, HelpCircle, Puzzle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/novo-anuncio', icon: PlusCircle, label: 'Novo Anúncio' },
  { to: '/grupos', icon: Users, label: 'Grupos' },
  { to: '/historico', icon: History, label: 'Histórico' },
  { to: '/configuracoes', icon: Settings, label: 'Configurações' },
  { to: '/ajuda', icon: HelpCircle, label: 'Ajuda' },
  { to: '/extensao', icon: Puzzle, label: 'Instalar Extensão' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [waStatus, setWaStatus] = useState('disconnected');

  useEffect(() => {
    let interval;

    const checkStatus = async () => {
      try {
        const { data } = await api.get('/groups/wa-status');
        setWaStatus(data.status);
      } catch {
        setWaStatus('disconnected');
      }
    };

    checkStatus();
    interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const statusColor =
    waStatus === 'ready'
      ? 'text-accent'
      : waStatus === 'rate_limited'
      ? 'text-orange-400'
      : waStatus === 'qr' || waStatus === 'authenticated' || waStatus === 'reconnecting' || waStatus === 'initializing'
      ? 'text-yellow-400'
      : 'text-red-400';

  const StatusIcon = waStatus === 'ready' ? Wifi : WifiOff;

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <Zap size={18} className="text-black" />
          </div>
          <div>
            <h1 className="text-text-primary font-bold text-lg leading-none">ZapOfertas</h1>
            <span className="text-text-secondary text-xs">Automação de anúncios</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'text-text-secondary hover:text-purple-400 hover:bg-purple-500/5'
              }`
            }
          >
            <Shield size={18} />
            Administração
          </NavLink>
        )}
      </nav>

      {/* Bottom: WA status + user */}
      <div className="px-3 py-4 border-t border-border space-y-2">
        {/* WhatsApp Status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3">
          <StatusIcon size={14} className={statusColor} />
          <span className={`text-xs font-medium ${statusColor}`}>
            {waStatus === 'ready'
              ? '🟢 WhatsApp Conectado'
              : waStatus === 'qr'
              ? '🟡 Aguardando QR'
              : waStatus === 'authenticated' || waStatus === 'initializing'
              ? '🟡 Conectando...'
              : waStatus === 'reconnecting'
              ? '🟡 Reconectando...'
              : waStatus === 'rate_limited'
              ? '🟠 Bloqueado'
              : '🔴 Desconectado'}
          </span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center text-accent font-bold text-sm">
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-primary text-sm font-medium truncate">
              {user?.name || user?.email}
            </p>
            <span className={`text-xs font-semibold ${user?.role === 'admin' ? 'text-purple-400' : user?.plan === 'pro' ? 'text-accent' : 'text-text-secondary'}`}>
              {user?.role === 'admin' ? 'Admin 🛡️' : user?.plan === 'pro' ? 'PRO ✨' : 'Free'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-text-secondary hover:text-red-400 transition-colors p-1"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
