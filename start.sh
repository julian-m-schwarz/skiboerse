#!/bin/bash

# Skiboerse Renningen - Start Script
# Startet Django Backend und React Frontend gleichzeitig

echo "Starting Skiboerse Renningen..."
echo ""

# Wechsel ins Projektverzeichnis
cd /Users/julianschwarz/skiboerse

# Bestehende Prozesse auf Port 8000 und 3000 beenden
echo "Beende bestehende Prozesse auf Port 8000 und 3000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# Migrationen ausfuehren
echo "Fuehre Datenbank-Migrationen aus..."
./venv/bin/python manage.py migrate --run-syncdb 2>&1 | tail -1

# Starte Django Backend im Hintergrund
echo "Starte Django Backend (Port 8000)..."
./venv/bin/python manage.py runserver &
DJANGO_PID=$!

# Warte bis Django tatsaechlich erreichbar ist
echo "Warte auf Django Backend..."
for i in $(seq 1 15); do
  if curl -s http://localhost:8000/api/ > /dev/null 2>&1; then
    echo "Django Backend laeuft."
    break
  fi
  sleep 1
done

# Wechsel ins Frontend-Verzeichnis
cd frontend_skiboerse

# Starte React Development Server
echo "Starte React Frontend (Port 3000)..."
echo ""
echo "Oeffne http://localhost:3000 im Browser"
echo "Druecke Ctrl+C um beide Server zu stoppen"
echo ""

npm start

# Wenn npm start beendet wird (Ctrl+C), beende auch Django
echo ""
echo "Stoppe Django Backend..."
kill $DJANGO_PID 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null
echo "Alle Server gestoppt."
