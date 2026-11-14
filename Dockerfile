# ============================================================================
# Образ приложения: собранный фронтенд + Node.js-бэкенд в одном контейнере.
# Сборка в два этапа: в первом ставим всё и собираем, во второй (итоговый)
# переносим только нужное, чтобы образ был меньше.
# ============================================================================

# ---------- Этап 1: сборка ----------
FROM node:22-bookworm-slim AS build
# Инструменты на случай, если better-sqlite3 придётся компилировать из исходников
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Сначала только package*.json: пока зависимости не менялись, Docker берёт
# этот слой из кеша и не ставит пакеты заново при каждой сборке
COPY frontend/package*.json frontend/
COPY backend/package*.json backend/
RUN npm ci --prefix frontend && npm ci --prefix backend --omit=dev

COPY frontend frontend
COPY backend backend
RUN npm run build --prefix frontend

# ---------- Этап 2: итоговый образ ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/database.db \
    UPLOADS_DIR=/data/uploads
WORKDIR /app
COPY --from=build /app/backend backend
COPY --from=build /app/frontend/dist frontend/dist

# База и загруженные документы живут в /data: это отдельный том (volume),
# он переживает пересборку и перезапуск контейнера
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 4000
CMD ["node", "backend/server.js"]
