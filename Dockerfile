FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
RUN npm run verify:canvas

COPY . .

ENV NODE_ENV=production

CMD ["npm", "run", "slack:start"]
