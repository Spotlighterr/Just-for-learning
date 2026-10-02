FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json server.js seed.json ./
COPY public ./public
RUN mkdir -p /app/data
ENV PORT=8787
ENV DATA_DIR=/app/data
EXPOSE 8787
CMD ["node", "server.js"]
