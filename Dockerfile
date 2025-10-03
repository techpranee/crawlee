FROM node:20-bullseye AS base
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

FROM node:20-bullseye AS builder
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx playwright install --with-deps chromium \
  && npm run build

FROM node:20-bullseye AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3011

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY package*.json ./
COPY .env.example ./

RUN mkdir -p storage exports
VOLUME ["/usr/src/app/storage", "/usr/src/app/exports"]

EXPOSE 3011

CMD ["node", "dist/server.js"]
