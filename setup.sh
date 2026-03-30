#!/bin/bash
set -e

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║        ZapOfertas - Setup             ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ é necessário. Instale em https://nodejs.org"
  exit 1
fi
echo "✅ Node.js $(node -v) detectado"

# Setup backend
echo ""
echo "📦 Instalando dependências do backend..."
cd backend
npm install

# Create .env if not exists
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "✅ Arquivo .env criado (edite com suas configurações)"
else
  echo "ℹ️  .env já existe, pulando..."
fi

# Create data directory
mkdir -p data data/sessions
echo "✅ Diretórios de dados criados"

cd ..

# Setup frontend
echo ""
echo "📦 Instalando dependências do frontend..."
cd frontend
npm install
cd ..

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  ✅ Setup concluído!                                   ║"
echo "║                                                        ║"
echo "║  Para iniciar em desenvolvimento:                      ║"
echo "║    Terminal 1: cd backend && npm run dev               ║"
echo "║    Terminal 2: cd frontend && npm run dev              ║"
echo "║                                                        ║"
echo "║  Backend:  http://localhost:3001                       ║"
echo "║  Frontend: http://localhost:5173                       ║"
echo "║                                                        ║"
echo "║  Primeiro acesso:                                      ║"
echo "║    1. Abra http://localhost:5173                       ║"
echo "║    2. Crie uma conta                                   ║"
echo "║    3. Vá em Configurações → Conectar WhatsApp          ║"
echo "║    4. Escaneie o QR Code com seu celular               ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
