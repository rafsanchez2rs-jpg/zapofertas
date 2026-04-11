import React, { useState, useEffect } from 'react';
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowRight, Puzzle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [mode, setMode] = useState(inviteToken ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name, inviteToken || undefined);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao processar solicitação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-accent rounded-2xl mb-4 glow-green">
            <Zap size={28} className="text-black" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary">ZapOfertas</h1>
          <p className="text-text-secondary mt-1.5">Automação de anúncios para WhatsApp</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          {inviteToken && (
            <div className="mb-4 bg-accent/10 border border-accent/20 rounded-lg px-3 py-2.5 text-accent text-sm">
              🎟️ Você possui um convite! Crie sua conta abaixo.
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex gap-1 bg-bg rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                mode === 'login' ? 'bg-accent text-black' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                mode === 'register' ? 'bg-accent text-black' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Nome</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="input pl-9"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="input pl-9"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                  className="input pl-9 pr-10"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-sm gap-2 mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Entrar' : 'Criar conta'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {mode === 'register' && !inviteToken && (
            <p className="text-center text-text-secondary text-xs mt-4">
              Ao criar sua conta, você começa no plano <strong className="text-text-primary">Free</strong> (3 grupos, 10 disparos/dia)
            </p>
          )}
          {mode === 'register' && inviteToken && (
            <p className="text-center text-text-secondary text-xs mt-4">
              Sua conta será criada com o plano <strong className="text-accent">PRO ✨</strong>
            </p>
          )}
        </div>

        {/* Extension link */}
        <div className="mt-4 text-center">
          <a
            href="/extensao"
            className="inline-flex items-center gap-1.5 text-text-secondary hover:text-accent transition-colors text-xs"
          >
            <Puzzle size={13} />
            Como instalar a extensão do Chrome?
          </a>
        </div>

        {/* Footer */}
        <p className="text-center text-text-secondary text-xs mt-4">
          ZapOfertas v1.0 — Automação inteligente de afiliados
        </p>
      </div>
    </div>
  );
}
