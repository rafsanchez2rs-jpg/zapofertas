FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ gcc git ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/
RUN rm -f package-lock.json && npm install --omit=dev --no-audit --no-fund

COPY src/ ./src/

EXPOSE 3001

CMD ["node", "src/server.js"]
