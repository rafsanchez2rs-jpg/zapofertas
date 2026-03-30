FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Build frontend com URL hardcoded
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install --no-cache

COPY frontend/ ./frontend/

# Criar .env.production com URL correta
RUN echo "VITE_API_URL=https://zapofertas-production.up.railway.app" > ./frontend/.env.production

RUN cd frontend && npm run build

# Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production --no-cache

COPY backend/ ./backend/

EXPOSE 8080

CMD ["node", "backend/src/server.js"]
