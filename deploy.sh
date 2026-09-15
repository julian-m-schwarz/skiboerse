#!/bin/bash
# =============================================================
# Skiboerse Deploy Script
# Verwendung: ./deploy.sh
# =============================================================
set -e

REPO_DIR="/home/pi/skiboerse"
VENV="$REPO_DIR/venv"
FRONTEND="$REPO_DIR/frontend_skiboerse"

# ── 1. Neuesten Code holen ────────────────────────────────────
echo "→ [1/9] Code aktualisieren..."
cd "$REPO_DIR"
git fetch origin
git reset --hard origin/main
# Alles entfernen, was nicht im main Branch ist (auch ignorierte Dateien wie
# __pycache__, db.sqlite3, alte Logs) - venv und node_modules bleiben erhalten,
# damit nicht bei jedem Deploy alle Pakete neu heruntergeladen werden muessen.
git clean -fdx -e venv -e frontend_skiboerse/node_modules
chmod +x "$REPO_DIR/deploy.sh"

# Re-exec mit aktuellem Script
if [ "$1" != "--updated" ]; then
  exec "$REPO_DIR/deploy.sh" --updated
fi

# ── 2. Python-Umgebung ────────────────────────────────────────
echo "→ [2/9] Python-Umgebung..."
if [ ! -f "$VENV/bin/activate" ]; then
  echo "  venv erstellen..."
  python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"
pip install -r "$REPO_DIR/requirements.txt" --quiet

# ── 3. Umgebungsvariablen ─────────────────────────────────────
echo "→ [3/9] Umgebungsvariablen..."
export DB_USER=skiboerse
export DB_PASSWORD=skiboerse123
export DJANGO_SETTINGS_MODULE=skiboerse.settings

# ── 4. Datenbank ──────────────────────────────────────────────
echo "→ [4/9] Datenbankmigrationen..."
cd "$REPO_DIR"
python manage.py migrate --noinput

# ── 5. Frontend bauen ─────────────────────────────────────────
echo "→ [5/9] Frontend bauen..."
cd "$FRONTEND"
npm install --silent
npm run build
cd "$REPO_DIR"

# ── 6. Statische Dateien ──────────────────────────────────────
echo "→ [6/9] Statische Dateien sammeln..."
python manage.py collectstatic --noinput --clear

# ── 7. Nginx ──────────────────────────────────────────────────
echo "→ [7/9] Nginx..."
sudo cp "$REPO_DIR/nginx/skiboerse.conf" /etc/nginx/sites-available/skiboerse

# Symlink anlegen falls er fehlt
if [ ! -L /etc/nginx/sites-enabled/skiboerse ]; then
  sudo ln -s /etc/nginx/sites-available/skiboerse /etc/nginx/sites-enabled/skiboerse
fi

# Default-Site deaktivieren falls aktiv (blockiert Port 80)
if [ -L /etc/nginx/sites-enabled/default ]; then
  sudo rm /etc/nginx/sites-enabled/default
fi

# Nginx braucht Lesezugriff auf /home/pi
chmod o+x /home/pi

sudo nginx -t
sudo systemctl reload nginx

# ── 8. Gunicorn ───────────────────────────────────────────────
echo "→ [8/9] Gunicorn..."

# Gunicorn-Service bei jedem Deploy aktualisieren
sudo tee /etc/systemd/system/gunicorn.service > /dev/null <<EOF
[Unit]
Description=Skiboerse Gunicorn
After=network.target

[Service]
User=pi
Group=www-data
WorkingDirectory=$REPO_DIR
Environment="DB_USER=skiboerse"
Environment="DB_PASSWORD=skiboerse123"
Environment="DJANGO_DEBUG=False"
ExecStart=$VENV/bin/gunicorn \
    --workers 2 \
    --bind unix:/run/gunicorn.sock \
    skiboerse.wsgi:application
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable gunicorn

sudo systemctl restart gunicorn
sleep 2

# ── 9. Aufraeumen ─────────────────────────────────────────────
echo "→ [9/9] Junk aufräumen..."

# Bytecode-Caches, die durch das Ausfuehren von Python neu entstanden sind
find "$REPO_DIR" -name "__pycache__" -type d -not -path "*/venv/*" -exec rm -rf {} + 2>/dev/null || true
find "$REPO_DIR" -name "*.pyc" -delete 2>/dev/null || true

# Download-Caches leeren (kosten nur Speicherplatz, werden nicht zur Laufzeit gebraucht)
"$VENV/bin/pip" cache purge >/dev/null 2>&1 || true
npm cache clean --force --prefix "$FRONTEND" >/dev/null 2>&1 || true
sudo apt-get clean

# Alte systemd-Journal-Logs kappen (wachsen sonst unbegrenzt auf der SD-Karte)
sudo journalctl --vacuum-time=7d --quiet 2>/dev/null || true

deactivate

# Status prüfen
if systemctl is-active --quiet gunicorn; then
  echo ""
  echo "✓ Deployment abgeschlossen!"
  echo "  URL: https://skiboerse.local"
else
  echo ""
  echo "✗ Gunicorn-Fehler! Logs:"
  sudo journalctl -u gunicorn --no-pager -n 20
  exit 1
fi
