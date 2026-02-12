# 🚀 Deployment Guide - Sol & Verde POS

## Quick Start (Docker - Recommended)

### 1. Clone Repository
```bash
git clone https://github.com/AlanDi123/Cta-Cte-P200.git
cd Cta-Cte-P200
```

### 2. Configure Environment
```bash
cp .env.example .env
nano .env
```

**IMPORTANT**: Change these values in `.env`:
```env
DB_PASSWORD=your_secure_password_here
JWT_SECRET=your_jwt_secret_key_here_change_in_production
```

### 3. Start Services
```bash
docker-compose up -d
```

### 4. Initialize Database
```bash
# Wait for PostgreSQL to be ready (about 10 seconds)
docker-compose exec backend npm run db:migrate
```

### 5. Verify Installation
```bash
# Check logs
docker-compose logs -f backend

# Test health endpoint
curl http://localhost:3000/health
```

You should see:
```json
{
  "status": "OK",
  "timestamp": "2026-02-12T...",
  "environment": "production",
  "version": "3.0.0"
}
```

### 6. Login
Default credentials:
- **Admin**: username: `admin`, password: `admin123`
- **Vendor**: username: `vendedor1`, password: `vendedor123`

**⚠️ CHANGE THESE PASSWORDS IMMEDIATELY IN PRODUCTION!**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

## Manual Installation (Without Docker)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm 9+

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Database
```bash
# As postgres user
createdb solverdepos
```

### 3. Initialize Schema
```bash
psql solverdepos < backend/database/init.sql
```

### 4. Seed Data
```bash
npm run db:migrate
```

### 5. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 6. Start Server
```bash
# Development
npm run dev

# Production
npm start
```

## Production Deployment

### Security Checklist
- [ ] Change default passwords
- [ ] Set strong JWT_SECRET
- [ ] Set strong DB_PASSWORD
- [ ] Enable HTTPS
- [ ] Configure firewall
- [ ] Set up backups
- [ ] Configure proper CORS origins
- [ ] Review logs regularly

### Environment Variables

#### Required
- `DB_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - Secret key for JWT tokens

#### Recommended
- `NODE_ENV=production`
- `PORT=3000`
- `CORS_ORIGIN` - Allowed origins
- `LOG_LEVEL=info`

### HTTPS Setup (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Systemd Service (Linux)

Create `/etc/systemd/system/solverdepos.service`:

```ini
[Unit]
Description=Sol & Verde POS Backend
After=network.target postgresql.service

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/solverdepos
Environment=NODE_ENV=production
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable solverdepos
sudo systemctl start solverdepos
sudo systemctl status solverdepos
```

## Database Backup & Restore

### Automatic Backups (Cron)

Create `/usr/local/bin/backup-solverdepos.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/solverdepos"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec -T postgres pg_dump -U postgres solverdepos > \
    $BACKUP_DIR/backup_$DATE.sql

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql" -mtime +30 -delete

# Compress old backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 ! -name "*.gz" -exec gzip {} \;
```

Add to crontab:
```bash
# Daily backup at 3 AM
0 3 * * * /usr/local/bin/backup-solverdepos.sh
```

### Manual Backup

```bash
# With Docker
docker-compose exec postgres pg_dump -U postgres solverdepos > backup.sql

# Without Docker
pg_dump -U postgres solverdepos > backup.sql
```

### Restore

```bash
# With Docker
docker-compose exec -T postgres psql -U postgres solverdepos < backup.sql

# Without Docker
psql -U postgres solverdepos < backup.sql
```

## Monitoring

### Health Check

```bash
# Simple check
curl http://localhost:3000/health

# With monitoring tool (Uptime Robot, etc)
# Monitor: http://your-domain.com/health
# Expected: 200 OK
```

### Logs

```bash
# Docker
docker-compose logs -f backend

# Systemd
sudo journalctl -u solverdepos -f

# Log files
tail -f logs/combined.log
tail -f logs/error.log
```

### Metrics

Monitor these key metrics:
- Response time
- Error rate
- Database connections
- Memory usage
- Disk space
- CPU usage

## Scaling

### Database Optimization

```sql
-- Analyze tables
ANALYZE;

-- Vacuum database
VACUUM;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Connection Pooling

Already configured in `backend/database/connection.js`:
- Max connections: 20
- Idle timeout: 30s
- Connection timeout: 2s

Adjust if needed for high load.

### Redis Caching (Optional)

The Docker Compose already includes Redis. To use it:

```javascript
import Redis from 'redis';
const redis = Redis.createClient({ url: 'redis://redis:6379' });
await redis.connect();

// Cache example
await redis.set('key', JSON.stringify(data), { EX: 3600 });
const cached = await redis.get('key');
```

## Migration from Google Sheets

### 1. Export from Google Apps Script

Use the legacy endpoint to export data:
```bash
curl "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=exportData" > legacy-data.json
```

### 2. Import to PostgreSQL

Create import script or use the migration tool:
```bash
npm run db:import -- --file=legacy-data.json
```

### 3. Verify Data

```sql
SELECT COUNT(*) FROM clientes;
SELECT COUNT(*) FROM productos;
SELECT COUNT(*) FROM movimientos;
```

### 4. Data Mapping

| Google Sheets | PostgreSQL |
|---------------|------------|
| CLIENTES | clientes |
| MOVIMIENTOS | cuenta_corriente |
| Transferencias | pagos |
| - | usuarios (new) |
| - | ventas (new) |
| - | productos (new) |

## Troubleshooting

### Database Connection Error

```
Error: Connection refused
```

**Solution:**
```bash
# Check PostgreSQL is running
docker-compose ps
# or
sudo systemctl status postgresql

# Check credentials in .env
cat .env | grep DB_
```

### Port Already in Use

```
Error: Port 3000 is already in use
```

**Solution:**
```bash
# Find process using port
lsof -i :3000
# or
netstat -tlnp | grep 3000

# Change port in .env
PORT=3001
```

### JWT Token Error

```
Error: Token inválido
```

**Solution:**
- Check JWT_SECRET is the same in .env
- Token may have expired (24h default)
- Request new token with /api/v1/auth/login

### Migration Failed

```
Error running migration
```

**Solution:**
```bash
# Check database exists
docker-compose exec postgres psql -U postgres -l

# Drop and recreate if needed
docker-compose exec postgres psql -U postgres -c "DROP DATABASE solverdepos"
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE solverdepos"

# Run init script
docker-compose exec -T postgres psql -U postgres solverdepos < backend/database/init.sql

# Run migration
docker-compose exec backend npm run db:migrate
```

## Support

For issues or questions:
1. Check this guide
2. Check logs: `docker-compose logs -f`
3. Review database: `docker-compose exec postgres psql -U postgres solverdepos`
4. Open GitHub issue with logs and error details

## Updates

### Updating the Application

```bash
# Backup first!
docker-compose exec postgres pg_dump -U postgres solverdepos > backup-before-update.sql

# Pull latest code
git pull origin main

# Rebuild containers
docker-compose down
docker-compose build
docker-compose up -d

# Run migrations if any
docker-compose exec backend npm run db:migrate
```

### Database Schema Updates

1. Always backup first
2. Test in development
3. Apply during low-traffic period
4. Monitor logs closely
5. Have rollback plan ready

---

**Sol & Verde POS** - Professional Wholesale Point of Sale System
