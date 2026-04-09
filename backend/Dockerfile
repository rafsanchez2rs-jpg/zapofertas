FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ gcc git ca-certificates \
    chromium chromium-sandbox \
    fonts-liberation libappindicator3-1 libasound2 \
    libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxss1 libxtst6 wget \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/
RUN rm -f package-lock.json && npm install --omit=dev --no-audit --no-fund

COPY src/ ./src/

RUN mkdir -p /app/data /app/data/sessions

EXPOSE 3001

CMD ["node", "src/server.js"]
