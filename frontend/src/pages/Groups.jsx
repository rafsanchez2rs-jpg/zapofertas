import React, { useState, useEffect } from 'react';
import {
  Users, RefreshCw, ToggleLeft, ToggleRight, Trash2,
  FolderPlus, Folder, Plus, Loader, AlertCircle, CheckCircle,
} from 'lucide-react';
import api from '../services/api';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const [groupsRes, collRes] = await Promise.all([
        api.get('/groups'),
        api.get('/groups/collections'),
      ]);
      setGroups(groupsRes.data.groups || []);
      setCollections(collRes.data.collections || []);
    } catch {
      setError('Erro ao carregar grupos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const { data } = await api.get('/groups/wa-sync');
      setGroups(data.groups || []);
      showSuccess(`${data.synced} grupos sincronizados com sucesso!`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao sincronizar. WhatsApp está conectado?');
    } finally {
      setSyncing(false);
    }
  };

  const toggleActive = async (group) => {
    try {
      const { data } = await api.put(`/groups/${group.id}`, { active: !group.active });
      setGroups(groups.map((g) => (g.id === group.id ? data.group : g)));
    } catch {
      setError('Erro ao atualizar grupo');
    }
  };

  const setCollection = async (groupId, collectionId) => {
    try {
      const { data } = await api.put(`/groups/${groupId}`, { collection_id: collectionId || null });
      setGroups(groups.map((g) => (g.id === groupId ? data.group : g)));
    } catch {
      setError('Erro ao atualizar coleção');
    }
  };

  const deleteGroup = async (groupId) => {
    if (!confirm('Remover este grupo?')) return;
    try {
      await api.delete(`/groups/${groupId}`);
      setGroups(groups.filter((g) => g.id !== groupId));
    } catch {
      setError('Erro ao remover grupo');
    }
  };

  const createCollection = async (e) => {
    e.preventDefault();
    if (!newCollection.trim()) return;
    try {
      const { data } = await api.post('/groups/collections', { name: newCollection.trim() });
      setCollections([...collections, data.collection]);
      setNewCollection('');
      showSuccess('Coleção criada!');
    } catch {
      setError('Erro ao criar coleção');
    }
  };

  const deleteCollection = async (id) => {
    if (!confirm('Remover esta coleção?')) return;
    try {
      await api.delete(`/groups/collections/${id}`);
      setCollections(collections.filter((c) => c.id !== id));
    } catch {
      setError('Erro ao remover coleção');
    }
  };

  const filteredGroups = groups.filter((g) => {
    if (filter === 'active') return g.active;
    if (filter === 'inactive') return !g.active;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Grupos</h1>
          <p className="text-text-secondary text-sm mt-1">
            {groups.filter((g) => g.active).length} ativos de {groups.length} grupos
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn-primary text-sm"
        >
          {syncing ? <Loader size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {syncing ? 'Sincronizando...' : 'Sincronizar WhatsApp'}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">×</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
          <CheckCircle size={16} className="text-accent flex-shrink-0" />
          <p className="text-accent text-sm">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Groups list */}
        <div className="xl:col-span-3 space-y-4">
          {/* Filters */}
          <div className="flex gap-2">
            {['all', 'active', 'inactive'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter === f
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f === 'all' ? 'Todos' : f === 'active' ? 'Ativos' : 'Inativos'}
              </button>
            ))}
          </div>

          {filteredGroups.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-12 text-center">
              <Users size={32} className="text-border mb-3" />
              <p className="text-text-secondary text-sm">
                {groups.length === 0
                  ? 'Nenhum grupo ainda. Clique em "Sincronizar WhatsApp" para carregar seus grupos.'
                  : 'Nenhum grupo com este filtro.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  className={`card flex items-center gap-4 transition-all duration-200 ${
                    !group.active ? 'opacity-50' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center text-accent font-bold flex-shrink-0">
                    {group.name[0]?.toUpperCase() || 'G'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary font-medium text-sm truncate">{group.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {group.participant_count > 0 && (
                        <span className="text-text-secondary text-xs">
                          {group.participant_count} membros
                        </span>
                      )}
                      {group.collection_name && (
                        <span className="badge badge-gray flex items-center gap-1">
                          <Folder size={10} />
                          {group.collection_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Collection selector */}
                  <select
                    value={group.collection_id || ''}
                    onChange={(e) => setCollection(group.id, e.target.value || null)}
                    className="bg-bg border border-border text-text-secondary text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-accent"
                  >
                    <option value="">Sem coleção</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleActive(group)}
                    className={`transition-colors ${group.active ? 'text-accent' : 'text-text-secondary'}`}
                    title={group.active ? 'Desativar grupo' : 'Ativar grupo'}
                  >
                    {group.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteGroup(group.id)}
                    className="text-text-secondary hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Collections sidebar */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-text-primary font-semibold text-sm mb-3 flex items-center gap-2">
              <Folder size={15} className="text-accent" />
              Coleções
            </h3>

            <form onSubmit={createCollection} className="flex gap-2 mb-3">
              <input
                type="text"
                value={newCollection}
                onChange={(e) => setNewCollection(e.target.value)}
                placeholder="Nome da coleção"
                className="input text-xs flex-1"
              />
              <button type="submit" className="btn-primary px-2.5">
                <Plus size={14} />
              </button>
            </form>

            {collections.length === 0 ? (
              <p className="text-text-secondary text-xs text-center py-4">
                Nenhuma coleção. Crie uma para organizar seus grupos.
              </p>
            ) : (
              <div className="space-y-1.5">
                {collections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-bg rounded-lg px-2.5 py-2">
                    <span className="text-text-primary text-xs font-medium flex items-center gap-1.5">
                      <Folder size={12} className="text-accent" />
                      {c.name}
                    </span>
                    <button
                      onClick={() => deleteCollection(c.id)}
                      className="text-text-secondary hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="card text-center">
            <p className="text-text-secondary text-xs">Total de grupos</p>
            <p className="text-3xl font-bold text-text-primary mt-1">{groups.length}</p>
            <div className="flex justify-center gap-4 mt-2">
              <div>
                <p className="text-accent text-lg font-bold">{groups.filter((g) => g.active).length}</p>
                <p className="text-text-secondary text-xs">Ativos</p>
              </div>
              <div>
                <p className="text-text-secondary text-lg font-bold">{groups.filter((g) => !g.active).length}</p>
                <p className="text-text-secondary text-xs">Inativos</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
