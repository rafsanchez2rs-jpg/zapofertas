FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ gcc git \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git@github.com:"

RUN npm install --omit=dev --no-audit --no-fund --no-package-lock

COPY src/ ./src/

RUN mkdir -p /app/data /app/data/sessions

EXPOSE 3001

CMD ["node", "src/server.js"]
