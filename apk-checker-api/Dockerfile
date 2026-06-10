FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip binutils aapt apksigner \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV CORS_ORIGIN=https://apk-checker-pro.vercel.app

EXPOSE 8080

CMD ["node", "server.js"]
