# ZapOfertas 🚀

Automação de anúncios de afiliados para grupos de WhatsApp. Cole um link da Shopee ou Mercado Livre e dispare anúncios formatados automaticamente para seus grupos.

---

## ✨ Funcionalidades

- **Scraping automático** de produtos Shopee e Mercado Livre (nome, preços, descontos, imagem)
- **Geração inteligente** de mensagens formatadas com headlines sorteadas
- **Preview em tempo real** estilo bolha do WhatsApp
- **Disparo para múltiplos grupos** com delay configurável entre envios
- **Agendamento** de postagens com node-cron
- **Histórico completo** de campanhas com status por grupo
- **Gerenciamento de grupos** com coleções para organização
- **Multi-tenant** com planos Free/Pro
- **Autenticação JWT** com refresh token automático

---

## 🛠️ Pré-requisitos

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **npm 9+** (incluso com Node.js)
- **Chrome/Chromium** (para o Puppeteer — fallback do scraper Shopee e WhatsApp Web)
- **~2GB de RAM** disponível para o Puppeteer/WhatsApp Web

---

## 🚀 Instalação

### Método 1: Script automático (recomendado)

```bash
chmod +x setup.sh
./setup.sh
```

### Método 2: Manual

```bash
# Backend
cd backend
npm install
cp .env.example .env    # edite com suas configurações
mkdir -p data data/sessions

# Frontend
cd ../frontend
npm install
```

---

## ▶️ Desenvolvimento

Abra dois terminais:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Rodando em http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Rodando em http://localhost:5173
```

Acesse: **http://localhost:5173**

---

## 🔧 Variáveis de Ambiente

Arquivo: `backend/.env`

```env
PORT=3001
JWT_SECRET=seu_secret_aqui_mude_em_producao
JWT_REFRESH_SECRET=seu_refresh_secret_aqui
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DB_PATH=./data/zapoferta.db

# Mercado Livre (opcional - para dados mais ricos)
ML_APP_ID=
ML_SECRET=
```

---

## 📱 Conectar WhatsApp

1. Inicie o sistema (backend + frontend)
2. Acesse o frontend e crie sua conta
3. Vá em **Configurações** → clique em **"Conectar via QR"**
4. Abra o WhatsApp no celular
5. Toque em **Mais opções** → **Aparelhos conectados** → **Conectar um aparelho**
6. Escaneie o QR Code exibido na tela
7. Aguarde a confirmação "WhatsApp Conectado"

> **Dica:** A sessão é salva localmente em `backend/data/sessions/`. Não é necessário reconectar a cada reinicialização, a menos que você faça logout.

---

## 🏗️ Build para Produção

```bash
# Frontend
cd frontend
npm run build
# Arquivos em frontend/dist/

# Backend (não precisa de build)
cd backend
NODE_ENV=production node src/server.js
```

---

## 🐳 Deploy com Docker

```bash
# Copie o .env para a raiz
cp backend/.env.example .env
# Edite o .env com suas configurações

# Suba os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f backend
```

Acesse: **http://localhost** (frontend) e **http://localhost:3001** (API)

---

## 🚂 Deploy no Railway

1. Crie conta em [railway.app](https://railway.app)
2. Crie um novo projeto → "Deploy from GitHub repo"
3. Selecione este repositório
4. Configure as variáveis de ambiente em **Variables**:
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`
5. O Railway detectará automaticamente o Node.js

> **Importante:** O Railway suporta Puppeteer. Adicione o buildpack `heroku/google-chrome` se necessário.

---

## 📡 Deploy em VPS com PM2

```bash
# Instale PM2 globalmente
npm install -g pm2

# Backend
cd backend
npm install --production
pm2 start src/server.js --name zapoferta-api

# Frontend (build + serve com nginx)
cd ../frontend
npm install && npm run build
# Configure nginx para servir dist/ e fazer proxy para :3001

# Salvar configuração do PM2
pm2 save
pm2 startup
```

---

## 📁 Estrutura do Projeto

```
zapOfertas/
├── backend/
│   ├── src/
│   │   ├── server.js           # Express + WebSocket
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT + rate limiting por plano
│   │   ├── routes/
│   │   │   ├── auth.js         # Login, registro, refresh token
│   │   │   ├── products.js     # Scraping + geração de anúncio
│   │   │   ├── groups.js       # CRUD grupos + coleções
│   │   │   ├── campaigns.js    # Histórico + disparo + agendamento
│   │   │   └── whatsapp.js     # Controle WA + configurações
│   │   ├── services/
│   │   │   ├── scraperShopee.js  # API Shopee + fallback Puppeteer
│   │   │   ├── scraperML.js      # API Mercado Livre
│   │   │   ├── adGenerator.js    # Engine de geração de anúncios
│   │   │   └── whatsappClient.js # Cliente WA multi-tenant
│   │   └── db/
│   │       ├── database.js       # SQLite (better-sqlite3)
│   │       └── migrations.js     # Schema das tabelas
│   └── data/                     # Banco de dados e sessões WA
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.jsx   # Stats + gráfico + status WA
│       │   ├── NewAd.jsx       # Fluxo principal: link → preview → disparar
│       │   ├── Groups.jsx      # Gerenciar grupos e coleções
│       │   ├── History.jsx     # Histórico de campanhas
│       │   └── Settings.jsx    # Configurações + QR Code
│       └── components/
│           ├── AdPreview.jsx     # Bolha estilo WhatsApp
│           ├── QRCodeModal.jsx   # Modal QR com WebSocket
│           ├── GroupSelector.jsx # Seletor de grupos
│           └── Navbar.jsx        # Navegação com status WA
└── docker-compose.yml
```

---

## 🔌 API REST

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/register` | Cadastro |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/products/scrape` | Scraping + gerar anúncio |
| POST | `/api/products/generate-ad` | Regenerar anúncio |
| GET | `/api/groups` | Listar grupos |
| GET | `/api/groups/wa-sync` | Sincronizar com WhatsApp |
| PUT | `/api/groups/:id` | Atualizar grupo |
| GET | `/api/campaigns` | Listar campanhas |
| GET | `/api/campaigns/stats` | Estatísticas dashboard |
| POST | `/api/campaigns` | Criar + disparar campanha |
| POST | `/api/campaigns/:id/resend` | Reenviar campanha |
| GET | `/api/whatsapp/status` | Status do WhatsApp |
| POST | `/api/whatsapp/connect` | Iniciar conexão |
| POST | `/api/whatsapp/disconnect` | Desconectar |

**WebSocket:** `ws://localhost:3001/ws/whatsapp?token=<JWT>`
Eventos: `{ status: 'qr' | 'ready' | 'disconnected', qr?: string }`

---

## ⚠️ Notas Importantes

- **Delays:** Respeite os delays entre envios (mínimo 3s). Envios muito rápidos podem resultar em banimento temporário pelo WhatsApp.
- **Scraping Shopee:** Usa a API pública. Em caso de bloqueio, ativa automaticamente o Puppeteer como fallback.
- **Sessão WhatsApp:** Salva localmente. Em produção, use volumes persistentes no Docker.
- **Uso responsável:** Use apenas em grupos onde você tem permissão para enviar mensagens comerciais.

---

## 📄 Licença

MIT — Use livremente para fins comerciais ou pessoais.
"# zapofertas" 
"# zapofertas" 
