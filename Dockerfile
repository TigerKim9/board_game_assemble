# Board game server: builds the web app and serves it together with the online WebSocket server.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
ENV PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
