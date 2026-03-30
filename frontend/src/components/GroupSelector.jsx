import React, { useState } from 'react';
import { Users, Search, CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react';

export default function GroupSelector({ groups, selected, onChange, maxGroups }) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeGroups = filtered.filter((g) => g.active !== false && g.active !== 0);

  const toggle = (groupId) => {
    if (selected.includes(groupId)) {
      onChange(selected.filter((id) => id !== groupId));
    } else {
      if (maxGroups && selected.length >= maxGroups) return;
      onChange([...selected, groupId]);
    }
  };

  const selectAll = () => {
    const ids = activeGroups.map((g) => g.id);
    if (maxGroups) {
      onChange(ids.slice(0, maxGroups));
    } else {
      onChange(ids);
    }
  };

  const clearAll = () => onChange([]);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Users size={16} className="text-accent" />
          <span className="text-text-primary font-semibold text-sm">
            Grupos Destino
          </span>
          {selected.length > 0 && (
            <span className="badge-green ml-1">
              {selected.length} selecionado{selected.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown size={16} className="text-text-secondary" /> : <ChevronUp size={16} className="text-text-secondary" />}
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-3 animate-slide-up">
          {/* Plan limit warning */}
          {maxGroups && (
            <div className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
              Plano Free: máximo de {maxGroups} grupos por disparo
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar grupo..."
              className="input pl-9 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-accent hover:text-accent-light transition-colors"
            >
              Selecionar todos
            </button>
            <span className="text-border">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Limpar seleção
            </button>
          </div>

          {/* Group list */}
          {groups.length === 0 ? (
            <div className="text-center py-6 text-text-secondary text-sm">
              <Users size={24} className="mx-auto mb-2 opacity-40" />
              <p>Nenhum grupo encontrado.</p>
              <p className="text-xs mt-1">
                Vá em <strong>Grupos</strong> e sincronize com o WhatsApp.
              </p>
            </div>
          ) : activeGroups.length === 0 ? (
            <p className="text-center text-text-secondary text-sm py-4">
              Nenhum grupo ativo encontrado
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {activeGroups.map((group) => {
                const isSelected = selected.includes(group.id);
                const isDisabled = maxGroups && !isSelected && selected.length >= maxGroups;

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggle(group.id)}
                    disabled={isDisabled}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150 ${
                      isSelected
                        ? 'bg-accent/10 border border-accent/30'
                        : isDisabled
                        ? 'opacity-40 cursor-not-allowed bg-white/3'
                        : 'hover:bg-white/5 bg-white/3 border border-transparent'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare size={16} className="text-accent flex-shrink-0" />
                    ) : (
                      <Square size={16} className="text-text-secondary flex-shrink-0" />
                    )}
                    <span className="text-sm text-text-primary truncate flex-1">
                      {group.name}
                    </span>
                    {group.participant_count > 0 && (
                      <span className="text-xs text-text-secondary flex-shrink-0">
                        {group.participant_count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
