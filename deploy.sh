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
git pull

echo "→ Python-Abhängigkeiten installieren..."
source venv/bin/activate
pip install -r requirements.txt --quiet

echo "→ Datenbankmigrationen durchführen..."
python manage.py migrate --noinput

echo "→ Frontend bauen..."
cd frontend_skiboerse
npm ci --silent
npm run build
cd ..

echo "→ Gunicorn neu starten..."
sudo systemctl restart gunicorn

echo "✓ Deployment abgeschlossen."
