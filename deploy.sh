#!/bin/bash
# =============================================================
# Skiboerse Deploy Script
# =============================================================
# Verwendung: Einmalig ausführbar machen mit:
#   chmod +x deploy.sh
# Dann bei jeder neuen Version auf dem Raspberry Pi ausführen:
#   ./deploy.sh
# =============================================================

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "→ Neuesten Code holen..."
cd "$REPO_DIR"
git fetch origin
git reset --hard origin/main
chmod +x "$0"

# Re-exec with updated script if this is the first run
if [ "$1" != "--updated" ]; then
  exec "$0" --updated
fi

echo "→ Python-Abhängigkeiten installieren..."
if [ ! -f "venv/bin/activate" ]; then
  echo "  venv nicht gefunden, wird erstellt..."
  python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt --quiet

echo "→ Umgebungsvariablen setzen..."
export DB_USER=skiboerse
export DB_PASSWORD=skiboerse123

echo "→ Datenbankmigrationen durchführen..."
python manage.py migrate --noinput

echo "→ Frontend bauen..."
cd frontend_skiboerse
npm install --silent
npm run build
cd ..

echo "→ Statische Dateien sammeln..."
python manage.py collectstatic --noinput --clear

echo "→ Nginx-Konfiguration aktualisieren..."
sudo cp "$REPO_DIR/nginx/skiboerse.conf" /etc/nginx/sites-available/skiboerse
sudo nginx -t
sudo systemctl reload nginx

echo "→ Gunicorn neu starten..."
sudo systemctl restart gunicorn

echo "✓ Deployment abgeschlossen."
