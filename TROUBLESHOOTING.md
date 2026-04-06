# Skibörse – Fehlerdiagnose & Troubleshooting

Dieses Dokument erklärt Schritt für Schritt, wie du Probleme auf dem Raspberry Pi diagnosezierst.
Immer zuerst den **Schnellcheck** durchführen, dann bei Bedarf tiefer gehen.

---

## Schnellcheck (30 Sekunden)

```bash
# Alle Dienste auf einmal prüfen
sudo systemctl status nginx gunicorn postgresql --no-pager | grep -E "Active:|●"
ls -la /run/gunicorn/gunicorn.sock
curl -k -H "Host: skiboerse.local" https://localhost/api/auth/session/
```

| Ergebnis | Bedeutung |
|----------|-----------|
| Alle drei `active (running)` | Dienste laufen |
| `srwxrwxrwx ... gunicorn.sock` | Gunicorn-Socket vorhanden |
| `{"isAuthenticated":false}` | Django antwortet korrekt |

---

## 1. Seite lädt gar nicht / Browser-Fehler

### 1.1 Nginx prüfen

```bash
sudo systemctl status nginx
```

**Was es bedeutet:**
- `active (running)` → Nginx läuft, Problem liegt woanders
- `failed` oder `inactive` → Nginx ist abgestürzt

```bash
sudo nginx -t
```

**Was es bedeutet:**
- `syntax is ok / test is successful` → Konfiguration ist fehlerfrei
- Fehlermeldung mit Zeilennummer → Nginx-Konfigurationsfehler

```bash
sudo journalctl -u nginx -n 30 --no-pager
```
Zeigt die letzten Nginx-Fehlermeldungen.

**Häufige Nginx-Fehler:**
| Fehlermeldung | Ursache | Lösung |
|---------------|---------|--------|
| `invalid number of arguments in limit_conn` | `limit_conn_zone` fehlt | Konfiguration neu schreiben |
| `bind() to 0.0.0.0:443 failed` | Port belegt oder kein Root | `sudo systemctl restart nginx` |
| `SSL_CTX_use_certificate_file failed` | Zertifikat fehlt | Zertifikat neu erstellen (siehe Abschnitt 6) |

**Nginx neu starten:**
```bash
sudo systemctl restart nginx
```

---

### 1.2 HTTPS-Zertifikat prüfen

Der Browser zeigt "Diese Verbindung ist nicht privat" → Das ist **normal** bei selbstsignierten Zertifikaten.

```bash
ls -la /etc/ssl/certs/skiboerse.crt /etc/ssl/private/skiboerse.key
```

**Was es bedeutet:**
- Beide Dateien vorhanden → Zertifikat existiert
- `No such file or directory` → Zertifikat fehlt, neu erstellen:

```bash
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/private/skiboerse.key \
  -out /etc/ssl/certs/skiboerse.crt \
  -subj "/CN=skiboerse.local"
sudo systemctl restart nginx
```

**Im Browser:** Nach dem Erstellen auf jedem Gerät einmalig die Zertifikatswarnung akzeptieren ("Trotzdem besuchen" / "Details → Website besuchen").

---

## 2. Seite lädt, aber Login hängt / funktioniert nicht

### 2.1 Backend erreichbar?

```bash
curl -k -H "Host: skiboerse.local" https://localhost/api/auth/session/
```

**Was es bedeutet:**
- `{"isAuthenticated":false}` → Backend läuft korrekt
- HTML-Ausgabe (60KB) → Django-Fehler (400 Bad Request)
- `Connection refused` → Gunicorn läuft nicht (→ Abschnitt 3)
- `502 Bad Gateway` → Gunicorn läuft nicht oder Socket fehlt (→ Abschnitt 3)

### 2.2 ALLOWED_HOSTS prüfen (häufigster Login-Fehler!)

Wenn `/api/auth/session/` HTML zurückgibt statt JSON:

```bash
grep "DJANGO_ALLOWED_HOSTS" ~/skiboerse/.env
```

**Was es bedeutet:**
- `skiboerse.local` und `192.168.4.1` müssen enthalten sein
- Fehlt ein Hostname → Django lehnt Anfragen mit diesem Host ab (400-Fehler)

```bash
# Fehlenden Host hinzufügen:
echo "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,skiboerse.local,192.168.4.1,skiboerse-renningen" >> ~/skiboerse/.env
sudo systemctl restart gunicorn
```

### 2.3 Login-Fehler: "Benutzer bereits angemeldet"

Django trackt aktive Sessions. Bei Serverneustarts können alte Sessions übrig bleiben:

```bash
cd ~/skiboerse && source venv/bin/activate
DB_USER=skiboerse DB_PASSWORD=skiboerse123 python manage.py shell \
  -c "from django.contrib.sessions.models import Session; Session.objects.all().delete(); print('Sessions geleert')"
```

### 2.4 Passwort vergessen

```bash
cd ~/skiboerse && source venv/bin/activate
DB_USER=skiboerse DB_PASSWORD=skiboerse123 python manage.py changepassword admin
```

### 2.5 Welche Benutzer existieren?

```bash
cd ~/skiboerse && source venv/bin/activate
DB_USER=skiboerse DB_PASSWORD=skiboerse123 python manage.py shell \
  -c "from django.contrib.auth.models import User; print(list(User.objects.values('username','is_superuser')))"
```

---

## 3. Gunicorn (Django-Backend) läuft nicht

### 3.1 Status prüfen

```bash
sudo systemctl status gunicorn
```

**Was es bedeutet:**
- `active (running)` → Gunicorn läuft
- `failed` oder `activating` → Gunicorn startet nicht oder ist abgestürzt
- `Unit gunicorn.service could not be found` → Service nicht installiert

### 3.2 Socket prüfen

```bash
ls -la /run/gunicorn/gunicorn.sock
```

**Was es bedeutet:**
- `srwxrwxrwx` → Socket vorhanden, Gunicorn läuft
- `No such file or directory` → Gunicorn läuft nicht oder Socket-Pfad falsch

### 3.3 Gunicorn-Fehlerlog

```bash
tail -50 /var/log/gunicorn/error.log
```

**Häufige Fehlermeldungen:**
| Fehlermeldung | Ursache | Lösung |
|---------------|---------|--------|
| `Permission denied` auf `/run/gunicorn.sock` | pi-User darf nicht in `/run/` schreiben | `RuntimeDirectory=gunicorn` in systemd-Service, Socket-Pfad auf `/run/gunicorn/gunicorn.sock` ändern |
| `No such file or directory` für Socket | Socket-Pfad stimmt nicht überein | gunicorn.conf.py und nginx auf gleichen Pfad prüfen |
| `fe_sendauth: no password supplied` | Falsche DB-Credentials | `.env`-Datei prüfen (Abschnitt 4) |
| `ALLOWED_HOSTS` Fehler | Hostname nicht erlaubt | `DJANGO_ALLOWED_HOSTS` in `.env` ergänzen |

### 3.4 Gunicorn manuell testen

```bash
cd ~/skiboerse && source venv/bin/activate
DB_USER=skiboerse DB_PASSWORD=skiboerse123 gunicorn --bind unix:/tmp/test.sock skiboerse.wsgi:application
```

Wenn der Befehl **läuft** (kein sofortiger Fehler) → Gunicorn funktioniert, Problem liegt in systemd-Konfiguration oder Pfaden.

### 3.5 Gunicorn-Service prüfen

```bash
sudo systemctl cat gunicorn
```

Die Service-Datei muss enthalten:
```ini
[Service]
RuntimeDirectory=gunicorn
EnvironmentFile=/home/pi/skiboerse/.env
User=pi
WorkingDirectory=/home/pi/skiboerse
ExecStart=/home/pi/skiboerse/venv/bin/gunicorn -c /home/pi/skiboerse/gunicorn.conf.py skiboerse.wsgi:application
```

Fehlt `RuntimeDirectory=gunicorn` → Pi-User kann keinen Socket in `/run/gunicorn/` erstellen.
Fehlt `EnvironmentFile` → Datenbankpasswort und ALLOWED_HOSTS werden nicht geladen.

```bash
# Nach Änderungen an der Service-Datei:
sudo systemctl daemon-reload && sudo systemctl restart gunicorn
```

---

## 4. Datenbank-Fehler

### 4.1 PostgreSQL läuft?

```bash
sudo systemctl status postgresql | grep Active
```

```bash
sudo -u postgres psql -c "\l"    # Datenbanken auflisten
sudo -u postgres psql -c "\du"   # Benutzer auflisten
```

**Was es bedeutet:**
- `skiboerse` in der Datenbankliste → Datenbank existiert
- `skiboerse` in der Benutzerliste → DB-User existiert

### 4.2 .env-Datei prüfen

```bash
cat ~/skiboerse/.env
```

Die Datei muss folgende Einträge haben:
```
DB_USER=skiboerse
DB_PASSWORD=skiboerse123
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=...
DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,skiboerse.local,192.168.4.1,skiboerse-renningen
```

**Fehlt die .env-Datei komplett:**
```bash
cat > ~/skiboerse/.env << 'EOF'
DB_USER=skiboerse
DB_PASSWORD=skiboerse123
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=django-insecure-raspberry-pi-skiboerse-2024
DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,skiboerse.local,192.168.4.1,skiboerse-renningen
EOF
sudo systemctl restart gunicorn
```

### 4.3 Datenbankverbindung direkt testen

```bash
cd ~/skiboerse && source venv/bin/activate
DB_USER=skiboerse DB_PASSWORD=skiboerse123 python manage.py check --database default
```

**Was es bedeutet:**
- `System check identified no issues` → Datenbankverbindung funktioniert
- Fehlermeldung → Datenbankproblem

### 4.4 Migrations prüfen

```bash
cd ~/skiboerse && source venv/bin/activate
DB_USER=skiboerse DB_PASSWORD=skiboerse123 python manage.py migrate
```

Wenn neue Migrations vorhanden → werden angewendet. Danach Gunicorn neu starten.

---

## 5. Kamera funktioniert nicht auf dem Handy

Die Kamera-API (`getUserMedia`) erfordert **HTTPS**. Auf HTTP funktioniert sie nicht.

**Checkliste:**
1. URL im Browser beginnt mit `https://` (nicht `http://`)
2. Zertifikatswarnung wurde auf dem Gerät akzeptiert
3. Browser hat Kamera-Berechtigung erhalten (beim ersten Zugriff fragen)

**Auf iOS/Safari:** Einstellungen → Safari → Kamera → "Fragen" oder "Erlauben"

---

## 6. Frontend zeigt alte Version / Änderungen nicht sichtbar

Nach Code-Änderungen muss das Frontend neu gebaut und Nginx neu geladen werden:

```bash
cd ~/skiboerse/frontend_skiboerse
npm run build

sudo systemctl reload nginx
```

**Danach im Browser:** Harter Reload mit `Cmd+Shift+R` (Mac) oder `Ctrl+Shift+R` (Windows/Linux).

---

## 7. Kompletter Neustart aller Dienste

```bash
sudo systemctl restart postgresql
sudo systemctl restart gunicorn
sleep 3
sudo systemctl restart nginx
```

Danach Schnellcheck aus Abschnitt 0 wiederholen.

---

## 8. Log-Dateien im Überblick

| Log | Befehl | Zeigt |
|-----|--------|-------|
| Nginx Zugriffe | `sudo tail -f /var/log/nginx/access.log` | Welche Requests ankommen, HTTP-Status-Codes |
| Nginx Fehler | `sudo tail -f /var/log/nginx/error.log` | Nginx-Konfigurationsfehler |
| Gunicorn Fehler | `tail -f /var/log/gunicorn/error.log` | Django-Fehler, DB-Verbindungsprobleme |
| Systemd (Gunicorn) | `sudo journalctl -u gunicorn -f` | Gunicorn Start/Stop-Ereignisse |
| Systemd (Nginx) | `sudo journalctl -u nginx -f` | Nginx Start/Stop-Ereignisse |

**HTTP-Status-Codes in den Nginx-Logs:**
| Status | Bedeutung |
|--------|-----------|
| 200 | OK – Anfrage erfolgreich |
| 304 | Not Modified – Browser-Cache genutzt |
| 301/302 | Redirect (HTTP → HTTPS) |
| 400 | Bad Request – oft ALLOWED_HOSTS-Problem |
| 403 | Forbidden – CSRF-Token fehlt oder falsche Berechtigungen |
| 404 | Not Found – URL existiert nicht |
| 502 | Bad Gateway – Gunicorn läuft nicht oder Socket fehlt |
| 503 | Service Unavailable – Überlast oder Gunicorn abgestürzt |

---

## 9. Wichtige Dateipfade

| Datei | Pfad |
|-------|------|
| Projekt | `/home/pi/skiboerse/` |
| Django-Settings | `/home/pi/skiboerse/skiboerse/settings.py` |
| Umgebungsvariablen | `/home/pi/skiboerse/.env` |
| Gunicorn-Konfiguration | `/home/pi/skiboerse/gunicorn.conf.py` |
| Gunicorn systemd-Service | `/etc/systemd/system/gunicorn.service` |
| Nginx-Konfiguration | `/etc/nginx/sites-available/skiboerse` |
| Nginx-Log | `/var/log/nginx/` |
| Gunicorn-Log | `/var/log/gunicorn/error.log` |
| SSL-Zertifikat | `/etc/ssl/certs/skiboerse.crt` |
| SSL-Key | `/etc/ssl/private/skiboerse.key` |
| Gunicorn-Socket | `/run/gunicorn/gunicorn.sock` |
| Frontend-Build | `/home/pi/skiboerse/frontend_skiboerse/build/` |
