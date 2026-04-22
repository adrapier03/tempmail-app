FROM node:24-alpine AS base

WORKDIR /app
ENV NODE_ENV=production

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server ./server
COPY web ./web
COPY storage ./storage

EXPOSE 3001

CMD ["node", "server/index.js"]
