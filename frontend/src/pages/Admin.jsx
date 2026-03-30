import React, { useState, useEffect } from 'react';
import {
  Shield, Users, Ticket, RefreshCw, Copy, Check,
  UserCheck, UserX, Crown, Loader,
} from 'lucide-react';
import api from '../services/api';

const PLAN_LABEL = {
  free: { label: 'Free', cls: 'text-text-secondary' },
  pro:  { label: 'PRO ✨', cls: 'text-accent' },
};

const ROLE_LABEL = {
  admin: { label: 'Admin', cls: 'text-purple-400' },
  user:  { label: 'User', cls: 'text-text-secondary' },
};

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setPlan = async (id, plan) => {
    setActing(id + plan);
    try {
      await api.patch(`/admin/users/${id}/plan`, { plan });
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, plan } : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao alterar plano');
    } finally {
      setActing(null);
    }
  };

  const deactivate = async (id) => {
    if (!window.confirm('Desativar este usuário?')) return;
    setActing(id + 'deactivate');
    try {
      await api.patch(`/admin/users/${id}/deactivate`);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, active: 0 } : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao desativar usuário');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-text-primary text-sm font-semibold">{users.length} usuários</span>
        <button onClick={load} className="btn-secondary text-xs py-1.5 px-3">
          <RefreshCw size={12} />
          Atualizar
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">ID</th>
              <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Nome</th>
              <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Email</th>
              <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Plano</th>
              <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Role</th>
              <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Cadastro</th>
              <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const planConf = PLAN_LABEL[u.plan] || PLAN_LABEL.free;
              const roleConf = ROLE_LABEL[u.role] || ROLE_LABEL.user;
              return (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-white/2">
                  <td className="px-4 py-3 text-text-secondary text-xs">{u.id}</td>
                  <td className="px-4 py-3 text-text-primary text-sm">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-text-secondary text-sm">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${planConf.cls}`}>{planConf.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${roleConf.cls}`}>{roleConf.label}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${u.active ? 'text-accent' : 'text-red-400'}`}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role !== 'admin' && (
                      <div className="flex items-center gap-1">
                        {u.plan !== 'pro' && (
                          <button
                            onClick={() => setPlan(u.id, 'pro')}
                            disabled={!!acting}
                            title="Tornar PRO"
                            className="text-text-secondary hover:text-accent transition-colors p-1"
                          >
                            {acting === u.id + 'pro' ? <Loader size={13} className="animate-spin" /> : <Crown size={13} />}
                          </button>
                        )}
                        {u.plan !== 'free' && (
                          <button
                            onClick={() => setPlan(u.id, 'free')}
                            disabled={!!acting}
                            title="Tornar Free"
                            className="text-text-secondary hover:text-yellow-400 transition-colors p-1"
                          >
                            {acting === u.id + 'free' ? <Loader size={13} className="animate-spin" /> : <UserCheck size={13} />}
                          </button>
                        )}
                        {u.active ? (
                          <button
                            onClick={() => deactivate(u.id)}
                            disabled={!!acting}
                            title="Remover (desativar)"
                            className="text-text-secondary hover:text-red-400 transition-colors p-1"
                          >
                            {acting === u.id + 'deactivate' ? <Loader size={13} className="animate-spin" /> : <UserX size={13} />}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvitesTab() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [plan, setPlan] = useState('pro');
  const [copied, setCopied] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/invites');
      setInvites(data.invites);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createInvite = async () => {
    setCreating(true);
    try {
      await api.post('/admin/invites', { plan });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao criar convite');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}/login?invite=${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Gerador de convite */}
      <div className="card flex flex-wrap items-center gap-3">
        <Ticket size={16} className="text-accent" />
        <span className="text-text-primary text-sm font-medium">Gerar convite</span>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="bg-bg border border-border text-text-secondary text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
        >
          <option value="pro">PRO</option>
          <option value="free">Free</option>
        </select>
        <button
          onClick={createInvite}
          disabled={creating}
          className="btn-primary text-sm py-1.5"
        >
          {creating ? <Loader size={14} className="animate-spin" /> : <Ticket size={14} />}
          Gerar link
        </button>
      </div>

      {/* Lista de convites */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-text-primary text-sm font-semibold">Convites</span>
          <button onClick={load} className="btn-secondary text-xs py-1.5 px-3">
            <RefreshCw size={12} />
            Atualizar
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader size={20} className="animate-spin text-accent" />
          </div>
        ) : invites.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-10">Nenhum convite gerado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Token</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Plano</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Status</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Usado por</th>
                  <th className="text-left text-text-secondary text-xs font-medium px-4 py-3">Criado em</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-white/2">
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {inv.token.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${inv.plan === 'pro' ? 'text-accent' : 'text-text-secondary'}`}>
                        {inv.plan === 'pro' ? 'PRO ✨' : 'Free'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {inv.used_by ? (
                        <span className="text-xs text-text-secondary">✅ Usado</span>
                      ) : (
                        <span className="text-xs text-yellow-400">⏳ Pendente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {inv.used_by_name || inv.used_by_email || '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                      {new Date(inv.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      {!inv.used_by && (
                        <button
                          onClick={() => copyLink(inv.token)}
                          title="Copiar link de convite"
                          className="text-text-secondary hover:text-accent transition-colors p-1"
                        >
                          {copied === inv.token ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('users');

  return (
    <div className="max-w-6xl animate-fade-in space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-500/10 rounded-lg flex items-center justify-center">
          <Shield size={18} className="text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Administração</h1>
          <p className="text-text-secondary text-sm mt-0.5">Gerenciamento de usuários e convites</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === 'users' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Users size={14} />
          Usuários
        </button>
        <button
          onClick={() => setTab('invites')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === 'invites' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Ticket size={14} />
          Convites
        </button>
      </div>

      {tab === 'users' ? <UsersTab /> : <InvitesTab />}
    </div>
  );
}
