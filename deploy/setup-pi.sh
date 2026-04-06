#!/bin/bash
# ============================================
# Skiboerse Renningen - Raspberry Pi Setup
# ============================================
# Dieses Script auf dem Raspberry Pi ausfuehren.
# Voraussetzung: Raspberry Pi OS mit Netzwerkzugang
#
# Nutzung:
#   1. Projektordner auf den Pi kopieren (scp, USB, git clone)
#   2. cd /home/pi/skiboerse
#   3. chmod +x deploy/setup-pi.sh
#   4. sudo bash deploy/setup-pi.sh
# ============================================

set -e

PROJECT_DIR="/home/pi/skiboerse"
VENV_DIR="$PROJECT_DIR/venv"

echo "========================================"
echo "  Skiboerse Renningen - Pi Setup"
echo "========================================"
echo ""

# 1. System-Pakete installieren
echo "[1/8] Installiere System-Pakete..."
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip \
    postgresql postgresql-contrib \
    nginx \
    nodejs npm \
    libpq-dev

# 2. PostgreSQL einrichten
echo "[2/8] Richte PostgreSQL ein..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='skiboerse'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER skiboerse WITH PASSWORD 'skiboerse';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='skiboerse'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE skiboerse OWNER skiboerse;"
echo "  PostgreSQL bereit."

# 3. Python Virtual Environment
echo "[3/8] Erstelle Python venv..."
cd "$PROJECT_DIR"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r requirements.txt
echo "  Python Dependencies installiert."

# 4. Django Setup
echo "[4/8] Django Migrationen + collectstatic..."
export DJANGO_DEBUG=False
export DJANGO_ALLOWED_HOSTS="skiboerse-renningen,localhost,127.0.0.1,192.168.178.65"
export DB_USER=skiboerse
export DB_PASSWORD=skiboerse
export DB_HOST=localhost

"$VENV_DIR/bin/python" manage.py migrate --run-syncdb
"$VENV_DIR/bin/python" manage.py collectstatic --noinput
echo "  Django bereit."

# 5. React Frontend bauen
echo "[5/8] Baue React Frontend..."
cd "$PROJECT_DIR/frontend_skiboerse"
npm install --silent
npm run build
echo "  Frontend Build fertig."

# 6. Superuser anlegen (falls noch keiner existiert)
echo "[6/8] Superuser pruefen..."
cd "$PROJECT_DIR"
"$VENV_DIR/bin/python" -c "
import django; import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'skiboerse.settings'
django.setup()
from django.contrib.auth.models import User
if not User.objects.filter(is_superuser=True).exists():
    print('  Kein Superuser gefunden. Bitte jetzt anlegen:')
    import subprocess
    subprocess.run(['$VENV_DIR/bin/python', 'manage.py', 'createsuperuser'])
else:
    print('  Superuser existiert bereits.')
"

# 7. Systemd Service einrichten
echo "[7/8] Richte Systemd Service ein..."
mkdir -p /var/log/gunicorn
chown pi:pi /var/log/gunicorn
cp "$PROJECT_DIR/deploy/skiboerse.service" /etc/systemd/system/skiboerse.service
systemctl daemon-reload
systemctl enable skiboerse
systemctl restart skiboerse
echo "  Gunicorn Service laeuft."

# 8. Nginx einrichten
echo "[8/8] Richte Nginx ein..."
cp "$PROJECT_DIR/deploy/nginx.conf" /etc/nginx/sites-available/skiboerse
ln -sf /etc/nginx/sites-available/skiboerse /etc/nginx/sites-enabled/skiboerse
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
echo "  Nginx laeuft."

# 9. Berechtigungen setzen (damit Nginx die Dateien lesen kann)
echo "  Setze Berechtigungen..."
chmod 755 /home/pi
chmod -R 755 "$PROJECT_DIR"
chown -R pi:pi "$PROJECT_DIR"

echo ""
echo "========================================"
echo "  Setup abgeschlossen!"
echo "========================================"
echo ""
echo "  Die App ist erreichbar unter:"
echo "    http://skiboerse-renningen"
echo "    http://$(hostname -I | awk '{print $1}')"
echo ""
echo "  Dienste verwalten:"
echo "    sudo systemctl status skiboerse"
echo "    sudo systemctl restart skiboerse"
echo "    sudo systemctl status nginx"
echo ""
echo "  Logs anzeigen:"
echo "    sudo journalctl -u skiboerse -f"
echo ""
