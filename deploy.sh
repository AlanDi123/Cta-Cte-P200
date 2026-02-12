#!/bin/bash

# Sol Verde POS - Production Deployment Script
# This script automates the deployment of the POS system

set -e

echo "======================================"
echo "Sol Verde POS - Deployment Script"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "⚠️  Please do not run this script as root"
   exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18 or higher is required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed"
    exit 1
fi
echo "✅ PostgreSQL is installed"

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env file with your configuration before continuing"
    exit 1
fi
echo "✅ .env file exists"

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
npm install --production

# Install frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Build frontend
echo ""
echo "🏗️  Building frontend..."
cd frontend
npm run build
cd ..

# Create necessary directories
echo ""
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p uploads
mkdir -p backups

# Database setup
echo ""
echo "🗄️  Setting up database..."
read -p "Do you want to initialize the database? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Creating database..."
    psql -U $DB_USER -h $DB_HOST -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "Database already exists"
    
    echo "Running migrations..."
    psql -U $DB_USER -h $DB_HOST -d $DB_NAME -f backend/database/init.sql
    
    echo "✅ Database initialized"
fi

# Create systemd service file
echo ""
read -p "Do you want to create a systemd service? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SERVICE_FILE="/etc/systemd/system/solverdepos.service"
    WORKING_DIR=$(pwd)
    USER=$(whoami)
    
    sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=Sol Verde POS System
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKING_DIR
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node $WORKING_DIR/backend/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=solverdepos

[Install]
WantedBy=multi-user.target
EOF

    echo "✅ Systemd service created at $SERVICE_FILE"
    echo ""
    echo "To enable and start the service:"
    echo "  sudo systemctl enable solverdepos"
    echo "  sudo systemctl start solverdepos"
    echo "  sudo systemctl status solverdepos"
fi

# Setup nginx reverse proxy
echo ""
read -p "Do you want to configure nginx reverse proxy? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter your domain name (e.g., pos.solverde.com): " DOMAIN
    
    NGINX_FILE="/etc/nginx/sites-available/solverdepos"
    
    sudo tee $NGINX_FILE > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads {
        alias $(pwd)/uploads;
        expires 30d;
    }
}
EOF

    sudo ln -sf $NGINX_FILE /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    
    echo "✅ Nginx configured for $DOMAIN"
    echo ""
    echo "To enable SSL with Let's Encrypt:"
    echo "  sudo certbot --nginx -d $DOMAIN"
fi

# Setup backup cron job
echo ""
read -p "Do you want to setup automatic backups? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    BACKUP_SCRIPT="$(pwd)/backup.sh"
    
    cat > $BACKUP_SCRIPT <<'EOF'
#!/bin/bash
# Automatic backup script for Sol Verde POS

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Create backup
pg_dump -U $DB_USER -h $DB_HOST $DB_NAME > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Delete backups older than 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE.gz"
EOF

    chmod +x $BACKUP_SCRIPT
    
    # Add to crontab (daily at 2 AM)
    (crontab -l 2>/dev/null; echo "0 2 * * * cd $(pwd) && ./backup.sh >> logs/backup.log 2>&1") | crontab -
    
    echo "✅ Backup script created and scheduled (daily at 2 AM)"
fi

echo ""
echo "======================================"
echo "✅ Deployment completed!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Review and edit .env file with your settings"
echo "2. Start the application:"
echo "   - With systemd: sudo systemctl start solverdepos"
echo "   - Manually: npm start"
echo "3. Access the application at http://localhost:$PORT"
echo "4. Login with default credentials (check documentation)"
echo ""
echo "For more information, see DEPLOYMENT.md"
echo ""
