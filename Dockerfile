FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Crear directorio de aplicación
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar código fuente
COPY backend ./backend

# Crear directorios necesarios
RUN mkdir -p uploads backups logs

# Exponer puerto
EXPOSE 3000

# Usuario sin privilegios
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node backend/healthcheck.js || exit 1

# Comando de inicio
CMD ["node", "backend/server.js"]
