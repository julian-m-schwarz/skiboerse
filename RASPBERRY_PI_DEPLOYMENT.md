# Skiboerse Deployment auf Raspberry Pi

Diese Anleitung beschreibt, wie die Skiboerse-App auf einem Raspberry Pi deployed wird, sodass sie automatisch beim Einschalten startet und über ein lokales WLAN-Netzwerk erreichbar ist.

## Voraussetzungen

- Raspberry Pi 4 (empfohlen) oder Raspberry Pi 3
- MicroSD-Karte (mindestens 16 GB)
- Raspberry Pi OS Lite (64-bit) installiert
- WLAN-Router für das lokale Netzwerk
- SSH-Zugang zum Raspberry Pi

---

## 1. Raspberry Pi Grundeinrichtung

### 1.1 OS installieren

1. Raspberry Pi Imager herunterladen: https://www.raspberrypi.com/software/
2. "Raspberry Pi OS Lite (64-bit)" auswählen
3. Vor dem Schreiben auf "Einstellungen" klicken:
   - Hostname: `skiboerse`
   - SSH aktivieren
   - Benutzername/Passwort setzen (z.B. `pi` / `IhrPasswort`)
   - WLAN konfigurieren (Router-SSID und Passwort)
4. Auf SD-Karte schreiben und in Raspberry Pi einsetzen

### 1.2 Mit Raspberry Pi verbinden

```bash
ssh pi@skiboerse.local
# oder mit IP-Adresse:
ssh pi@192.168.1.XXX
```

### 1.3 System aktualisieren

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 2. Abhängigkeiten installieren

### 2.1 Python und Build-Tools

```bash
sudo apt install -y python3 python3-pip python3-venv python3-dev \
    build-essential libffi-dev libssl-dev libjpeg-dev zlib1g-dev \
    libfreetype6-dev git nginx
```

### 2.2 Node.js installieren (für Frontend-Build)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 3. Anwendung installieren

### 3.1 Projektordner erstellen

```bash
sudo mkdir -p /opt/skiboerse
sudo chown pi:pi /opt/skiboerse
cd /opt/skiboerse
```

### 3.2 Projekt-Dateien übertragen

Vom lokalen Rechner (wo das Projekt liegt):

```bash
# Vom Mac/PC aus ausführen:
rsync -avz --exclude 'node_modules' --exclude 'venv' --exclude '__pycache__' \
    --exclude '.git' --exclude 'db.sqlite3' \
    /Users/julianschwarz/skiboerse/ pi@skiboerse.local:/opt/skiboerse/
```

### 3.3 Python Virtual Environment einrichten

```bash
cd /opt/skiboerse
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Falls keine `requirements.txt` existiert, manuell installieren:

```bash
pip install django djangorestframework django-cors-headers \
    python-barcode Pillow gunicorn
```

### 3.4 Django konfigurieren

Datei `/opt/skiboerse/skiboerse_project/settings.py` bearbeiten:

```bash
nano /opt/skiboerse/skiboerse_project/settings.py
```

Folgende Einstellungen anpassen:

```python
DEBUG = False

ALLOWED_HOSTS = ['*']  # Oder spezifische IP: ['192.168.1.100', 'skiboerse.local']

# Am Ende der Datei hinzufügen:
STATIC_ROOT = '/opt/skiboerse/staticfiles'
```

### 3.5 Datenbank und statische Dateien

```bash
cd /opt/skiboerse
source venv/bin/activate

# Datenbank-Migrationen
python manage.py migrate

# Admin-Benutzer erstellen
python manage.py createsuperuser

# Statische Dateien sammeln
python manage.py collectstatic --noinput
```

### 3.6 Frontend bauen

```bash
cd /opt/skiboerse/frontend_skiboerse
npm install
npm run build
```

---

## 4. Gunicorn als WSGI-Server einrichten

### 4.1 Gunicorn-Socket erstellen

```bash
sudo nano /etc/systemd/system/gunicorn.socket
```

Inhalt:

```ini
[Unit]
Description=Gunicorn Socket für Skiboerse

[Socket]
ListenStream=/run/gunicorn.sock

[Install]
WantedBy=sockets.target
```

### 4.2 Gunicorn-Service erstellen

```bash
sudo nano /etc/systemd/system/gunicorn.service
```

Inhalt:

```ini
[Unit]
Description=Gunicorn Daemon für Skiboerse
Requires=gunicorn.socket
After=network.target

[Service]
User=pi
Group=www-data
WorkingDirectory=/opt/skiboerse
ExecStart=/opt/skiboerse/venv/bin/gunicorn \
    --access-logfile - \
    --error-logfile /var/log/gunicorn/error.log \
    --workers 3 \
    --bind unix:/run/gunicorn.sock \
    skiboerse_project.wsgi:application

Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### 4.3 Log-Verzeichnis erstellen und Service starten

```bash
sudo mkdir -p /var/log/gunicorn
sudo chown pi:www-data /var/log/gunicorn

sudo systemctl daemon-reload
sudo systemctl start gunicorn.socket
sudo systemctl enable gunicorn.socket

# Testen
sudo systemctl status gunicorn.socket
curl --unix-socket /run/gunicorn.sock localhost
```

---

## 5. Nginx als Reverse Proxy

### 5.1 Nginx konfigurieren

```bash
sudo nano /etc/nginx/sites-available/skiboerse
```

Inhalt:

```nginx
server {
    listen 80;
    server_name skiboerse.local _;

    # Frontend (React Build)
    location / {
        root /opt/skiboerse/frontend_skiboerse/build;
        try_files $uri $uri/ /index.html;
    }

    # API Requests an Django
    location /api/ {
        proxy_pass http://unix:/run/gunicorn.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django Admin
    location /admin/ {
        proxy_pass http://unix:/run/gunicorn.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Statische Dateien für Django Admin
    location /static/ {
        alias /opt/skiboerse/staticfiles/;
    }
}
```

### 5.2 Nginx aktivieren

```bash
sudo ln -s /etc/nginx/sites-available/skiboerse /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

### 5.3 HTTPS einrichten (Pflicht für Kamerazugriff auf Handys)

> **Warum HTTPS?** Browser blockieren den Zugriff auf die Handy-Kamera (`getUserMedia`) auf unsicheren HTTP-Verbindungen. Die Funktion "Kamera als Barcode-Scanner" in der Artikelrückmeldung funktioniert nur über HTTPS.

#### Schritt 1: Self-Signed Zertifikat erstellen

```bash
# Zertifikat und privaten Schlüssel generieren (10 Jahre gültig)
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/private/skiboerse.key \
    -out /etc/ssl/certs/skiboerse.crt \
    -subj "/CN=skiboerse.local"
```

#### Schritt 2: Optimierte Nginx-Konfiguration aus dem Repository verwenden

Die Datei `nginx/skiboerse.conf` im Repository enthält bereits die fertige HTTPS-Konfiguration. Sie leitet HTTP automatisch auf HTTPS um:

```bash
sudo cp /opt/skiboerse/nginx/skiboerse.conf /etc/nginx/sites-available/skiboerse
sudo nginx -t
sudo systemctl reload nginx
```

#### Schritt 3: Zertifikat auf Handys einmalig akzeptieren

Beim ersten Aufruf von `https://skiboerse.local` oder `https://192.168.x.x` zeigt der Browser eine Sicherheitswarnung wegen des self-signed Zertifikats.

**Android (Chrome):**
1. Warnung → "Erweitert" → "Weiter zu skiboerse.local (unsicher)"
2. Einmalig bestätigen — danach gespeichert

**iPhone/iPad (Safari):**
1. Warnung → "Details einblenden" → "Diese Website trotzdem besuchen"
2. Danach: Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen → Zertifikat aktivieren

**Ergebnis:** Kamerazugriff funktioniert danach ohne weitere Schritte.

#### Zusammenfassung: Kamerazugriff

| Verbindung | Kamerazugriff |
|---|---|
| `http://192.168.x.x` | ❌ Gesperrt vom Browser |
| `https://192.168.x.x` (self-signed, akzeptiert) | ✅ Funktioniert |
| `localhost` | ✅ Funktioniert immer |

---

## 6. WLAN-Netzwerk einrichten

### Option A: Raspberry Pi verbindet sich mit bestehendem Router

Der Raspberry Pi verbindet sich mit dem WLAN-Router. Alle Geräte im gleichen Netzwerk können auf die App zugreifen.

#### 6.1 WLAN konfigurieren

```bash
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
```

Inhalt:

```
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=DE

network={
    ssid="IHR_ROUTER_NAME"
    psk="IHR_WLAN_PASSWORT"
    priority=1
}
```

#### 6.2 Statische IP-Adresse (empfohlen)

```bash
sudo nano /etc/dhcpcd.conf
```

Am Ende hinzufügen:

```
interface wlan0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

Neustart:

```bash
sudo reboot
```

**Zugriff:** `https://192.168.1.100` oder `https://skiboerse.local` (nach HTTPS-Einrichtung in Abschnitt 5.3)

---

### Option B: Raspberry Pi als WLAN Access Point

Der Raspberry Pi erstellt ein eigenes WLAN-Netzwerk, mit dem sich Geräte direkt verbinden.

#### 6.1 Pakete installieren

```bash
sudo apt install -y hostapd dnsmasq
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq
```

#### 6.2 Statische IP für wlan0

```bash
sudo nano /etc/dhcpcd.conf
```

Am Ende hinzufügen:

```
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
```

#### 6.3 DHCP-Server konfigurieren

```bash
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.orig
sudo nano /etc/dnsmasq.conf
```

Inhalt:

```
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.50,255.255.255.0,24h
address=/skiboerse.local/192.168.4.1
```

#### 6.4 Access Point konfigurieren

```bash
sudo nano /etc/hostapd/hostapd.conf
```

Inhalt:

```
country_code=DE
interface=wlan0
ssid=Skiboerse
hw_mode=g
channel=7
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=skiboerse2024
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

#### 6.5 Hostapd aktivieren

```bash
sudo nano /etc/default/hostapd
```

Zeile hinzufügen:

```
DAEMON_CONF="/etc/hostapd/hostapd.conf"
```

#### 6.6 Services aktivieren

```bash
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq
sudo reboot
```

**Zugriff:**
1. Mit WLAN "Skiboerse" verbinden (Passwort: `skiboerse2024`)
2. Browser öffnen: `https://192.168.4.1` oder `https://skiboerse.local`
3. Sicherheitswarnung einmalig bestätigen (self-signed Zertifikat, siehe Abschnitt 5.3)

---

## 7. Hardware-Architektur

### Wichtig: Drucker & Scanner sind an den Laptops angeschlossen

```
┌───────────────────────────────────────────────────────────────────────┐
│                          WLAN-Netzwerk                                │
│                                                                       │
│                      ┌──────────────┐                                 │
│                      │ Raspberry Pi │  ◄── Server (Django + React)    │
│                      │   (Server)   │                                 │
│                      └──────────────┘                                 │
│                             │                                         │
│              ┌──────────────┼──────────────┐                          │
│              │              │              │                          │
│              ▼              ▼              ▼                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│   │   Laptop 1   │  │   Laptop 2   │  │   Handy 1    │  ...           │
│   │   (Kasse)    │  │  (Annahme)   │  │ (Rückmeldung)│                │
│   └──────────────┘  └──────────────┘  └──────────────┘                │
│          │                 │                                          │
│          │ USB             │ USB                                      │
│          ▼                 ▼                                          │
│   ┌──────────────┐  ┌──────────────┐                                  │
│   │  Barcode-    │  │  Etiketten-  │                                  │
│   │  Scanner     │  │  drucker     │                                  │
│   └──────────────┘  └──────────────┘                                  │
└───────────────────────────────────────────────────────────────────────┘
```

### Handys (Artikelrückmeldung)

- Verbinden sich mit dem WLAN-Netzwerk
- Öffnen die App im mobilen Browser
- Nutzen die Handy-Kamera als Barcode-Scanner (falls unterstützt) oder geben Barcodes manuell ein
- Ideal für die mobile Artikelrückmeldung im Lager/Verkaufsraum

### Barcode-Scanner

- Der Scanner verhält sich wie eine USB-Tastatur
- Scannt direkt in das fokussierte Eingabefeld im Browser
- Keine spezielle Konfiguration auf dem Raspberry Pi nötig
- Funktioniert automatisch, wenn der Scanner am Laptop angeschlossen ist

### Etikettendrucker

Der Etikettendruck erfolgt über den Browser des Laptops:

1. **Label drucken** Button in der App generiert ein Bild
2. Das Bild wird vom Server erstellt und an den Browser gesendet
3. Der Browser öffnet den Druckdialog
4. Der Nutzer wählt den lokalen Etikettendrucker

**Drucker am Laptop einrichten:**

- **Windows:** Drucker über Systemsteuerung → Geräte und Drucker hinzufügen
- **macOS:** Systemeinstellungen → Drucker & Scanner → Drucker hinzufügen
- **Linux:** CUPS über `http://localhost:631` oder Systemeinstellungen

**Tipps:**
- Den Etikettendrucker als Standarddrucker setzen, damit er automatisch ausgewählt wird
- **Popup-Blocker deaktivieren:** Der Druckdialog öffnet ein neues Fenster - Popups für die Skiboerse-Seite müssen erlaubt sein

---

## 8. Automatischer Neustart bei Absturz

Die systemd-Services (gunicorn, nginx) starten automatisch bei Boot und nach Abstürzen.

### Status prüfen

```bash
sudo systemctl status gunicorn
sudo systemctl status nginx
```

### Logs anzeigen

```bash
# Gunicorn Logs
sudo journalctl -u gunicorn -f

# Nginx Logs
sudo tail -f /var/log/nginx/error.log
```

---

## 9. Updates einspielen

Wenn Änderungen am Code gemacht wurden:

```bash
# Vom lokalen Rechner:
rsync -avz --exclude 'node_modules' --exclude 'venv' --exclude '__pycache__' \
    --exclude '.git' --exclude 'db.sqlite3' \
    /Users/julianschwarz/skiboerse/ pi@skiboerse.local:/opt/skiboerse/

# Auf dem Raspberry Pi:
ssh pi@skiboerse.local
cd /opt/skiboerse

# Backend aktualisieren
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart gunicorn

# Frontend aktualisieren
cd frontend_skiboerse
npm install
npm run build
```

---

## 10. Fehlerbehebung

### App nicht erreichbar

```bash
# Netzwerk prüfen
ip addr show wlan0

# Services prüfen
sudo systemctl status gunicorn
sudo systemctl status nginx

# Gunicorn manuell testen
cd /opt/skiboerse
source venv/bin/activate
gunicorn --bind 0.0.0.0:8000 skiboerse_project.wsgi:application
```

### Datenbank-Fehler

```bash
cd /opt/skiboerse
source venv/bin/activate
python manage.py migrate
python manage.py check
```

### Berechtigungsfehler

```bash
sudo chown -R pi:www-data /opt/skiboerse
sudo chmod -R 755 /opt/skiboerse
```

---

## 11. Performance-Optimierungen

### Kapazitätsschätzung (Raspberry Pi 4, 4GB RAM)

| Szenario | Gleichzeitige Geräte | Erwartete Performance |
|----------|---------------------|----------------------|
| **Optimal** | 10-15 | Flüssig, < 200ms Antwortzeit |
| **Gut** | 15-25 | Akzeptabel, < 500ms Antwortzeit |
| **Grenzbereich** | 25-40 | Spürbare Verzögerungen, 1-2s |
| **Überlastet** | > 40 | Timeouts möglich |

Für eine typische Skibörse mit 2-3 Laptops und 3-5 Handys ist der Pi 4 ausreichend.

---

### 11.1 Gunicorn Worker erhöhen

Mehr Worker = mehr parallele Anfragen. Faustregel: `(2 × CPU-Kerne) + 1`

```bash
sudo nano /etc/systemd/system/gunicorn.service
```

Ändern von `--workers 3` auf `--workers 5`:

```ini
ExecStart=/opt/skiboerse/venv/bin/gunicorn \
    --access-logfile - \
    --error-logfile /var/log/gunicorn/error.log \
    --workers 5 \
    --bind unix:/run/gunicorn.sock \
    skiboerse_project.wsgi:application
```

Neustart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart gunicorn
```

---

### 11.2 SQLite → PostgreSQL (für bessere Parallelität)

SQLite erlaubt nur einen Schreibzugriff gleichzeitig. PostgreSQL ist besser für mehrere gleichzeitige Nutzer.

#### PostgreSQL installieren

```bash
sudo apt install -y postgresql postgresql-contrib libpq-dev
sudo -u postgres createuser -P skiboerse
# Passwort eingeben, z.B.: skiboerse123
sudo -u postgres createdb -O skiboerse skiboerse_db
```

#### Python-Treiber installieren

```bash
cd /opt/skiboerse
source venv/bin/activate
pip install psycopg2-binary
```

#### Django konfigurieren

`/opt/skiboerse/skiboerse_project/settings.py` bearbeiten:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'skiboerse_db',
        'USER': 'skiboerse',
        'PASSWORD': 'skiboerse123',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

#### Datenbank migrieren

```bash
cd /opt/skiboerse
source venv/bin/activate
python manage.py migrate
python manage.py createsuperuser
sudo systemctl restart gunicorn
```

---

### 11.3 Redis für Session-Caching

Redis speichert Sessions im RAM statt in der Datenbank → schnellere Login-Prüfungen.

#### Redis installieren

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

#### Python-Pakete installieren

```bash
cd /opt/skiboerse
source venv/bin/activate
pip install django-redis
```

#### Django konfigurieren

`/opt/skiboerse/skiboerse_project/settings.py` bearbeiten:

```python
# Session-Backend auf Redis umstellen
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

SESSION_ENGINE = 'django.contrib.sessions.backends.cache'
SESSION_CACHE_ALIAS = 'default'
```

Neustart:

```bash
sudo systemctl restart gunicorn
```

---

### 11.4 Ressourcenverbrauch überwachen

```bash
# RAM-Verbrauch anzeigen
free -h

# CPU-Last anzeigen
htop

# Gunicorn-Prozesse prüfen
ps aux | grep gunicorn

# Nginx-Verbindungen zählen
sudo netstat -an | grep :80 | wc -l
```

---

### Zusammenfassung Optimierungen

| Optimierung | Aufwand | Effekt |
|-------------|---------|--------|
| Gunicorn 5 Worker | Gering (5 Min) | +30% Durchsatz |
| PostgreSQL | Mittel (20 Min) | Bessere Parallelität |
| Redis Sessions | Mittel (15 Min) | Schnellere Logins |

**Empfehlung für Skibörse:** Gunicorn Worker erhöhen reicht meist aus. PostgreSQL und Redis nur bei > 20 gleichzeitigen Nutzern nötig.

---

## Zusammenfassung Netzwerkzugriff

| Setup | WLAN-Name | Passwort | URL |
|-------|-----------|----------|-----|
| Mit Router | (Ihr Router) | (Ihr Passwort) | `https://192.168.1.100` |
| Als Access Point | Skiboerse | skiboerse2024 | `https://192.168.4.1` |

> **Hinweis:** HTTPS ist erforderlich damit Handys die Kamera als Barcode-Scanner nutzen können. Beim ersten Aufruf muss das self-signed Zertifikat einmalig im Browser akzeptiert werden (siehe Abschnitt 5.3).

---

## 12. RAM-Optimierung (für Raspberry Pi mit wenig Speicher)

Diese Optimierungen wurden bereits in der App implementiert und reduzieren den RAM-Verbrauch erheblich.

### 12.1 Frontend-Optimierungen (bereits implementiert)

- **Code-Splitting mit React.lazy()**: Komponenten werden erst bei Bedarf geladen
- **Keine Source Maps in Production**: Build-Script generiert keine Debug-Dateien
- **Test-Dependencies als devDependencies**: Werden nicht im Production-Build inkludiert

### 12.2 Gunicorn-Konfiguration für minimalen RAM

Die optimierte Konfiguration liegt in `/opt/skiboerse/gunicorn.conf.py`:

```bash
# Gunicorn mit Konfigurationsdatei starten
sudo nano /etc/systemd/system/gunicorn.service
```

Ändern Sie die ExecStart-Zeile:

```ini
ExecStart=/opt/skiboerse/venv/bin/gunicorn -c /opt/skiboerse/gunicorn.conf.py skiboerse.wsgi:application
```

**Wichtige Einstellungen:**

| Einstellung | Wert | Effekt |
|-------------|------|--------|
| `workers` | 2 | Weniger RAM, ausreichend für 10-15 Nutzer |
| `preload_app` | True | Worker teilen sich Speicher |
| `max_requests` | 1000 | Verhindert Speicherlecks |
| `worker_class` | sync | Effizientester Modus |

### 12.3 SQLite statt PostgreSQL (spart ~100MB RAM)

Für kleine Installationen kann SQLite verwendet werden:

```python
# In /opt/skiboerse/skiboerse/settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
```

**Achtung:** SQLite erlaubt nur einen Schreibzugriff gleichzeitig. Nur für < 10 gleichzeitige Nutzer empfohlen.

### 12.4 Swap-Speicher konfigurieren (Notfall-Reserve)

Falls der RAM knapp wird, kann Swap helfen:

```bash
# Aktuellen Swap anzeigen
free -h

# 1GB Swap-Datei erstellen (falls nicht vorhanden)
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# CONF_SWAPSIZE=1024 setzen
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### 12.5 Erwarteter RAM-Verbrauch

| Komponente | RAM-Verbrauch |
|------------|---------------|
| Raspberry Pi OS | ~200 MB |
| Nginx | ~10 MB |
| Gunicorn (2 Worker) | ~150 MB |
| PostgreSQL | ~100 MB |
| **Gesamt** | **~460 MB** |

Mit SQLite statt PostgreSQL: **~360 MB**

**Freier RAM für Cache/Buffer:** ~1.5-3.5 GB (je nach Pi-Modell)

---

## 13. Überlastungsschutz (Connection Limiting)

Diese Funktion schützt den Server vor Überlastung und zeigt eine freundliche Wartungsseite an.

### 13.1 Nginx-Konfiguration mit Connection Limits

Die optimierte Nginx-Konfiguration liegt im Repository unter `nginx/skiboerse.conf`.

```bash
# Konfiguration kopieren
sudo cp /opt/skiboerse/nginx/skiboerse.conf /etc/nginx/sites-available/skiboerse
sudo cp /opt/skiboerse/nginx/503.html /opt/skiboerse/nginx/

# Aktivieren (falls noch nicht geschehen)
sudo ln -sf /etc/nginx/sites-available/skiboerse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Konfiguration testen
sudo nginx -t

# Nginx neu laden
sudo systemctl reload nginx
```

### 13.2 Konfigurierte Limits

| Limit | Wert | Beschreibung |
|-------|------|--------------|
| **Pro IP** | 10 Verbindungen | Verhindert, dass ein Gerät alle Slots belegt |
| **Gesamt** | 50 Verbindungen | Maximale gleichzeitige Verbindungen |
| **API Rate** | 10 Anfragen/Sek | Schutz vor API-Spam |

### 13.3 Was passiert bei Überlastung?

1. Nutzer sehen eine freundliche "Server ausgelastet"-Seite im Ski Club Design
2. Die Seite lädt automatisch nach 10 Sekunden neu
3. Statische Dateien (CSS, JS, Bilder) sind vom Limit ausgenommen

### 13.4 Limits anpassen

Falls mehr Geräte benötigt werden, in `/etc/nginx/sites-available/skiboerse`:

```nginx
# Mehr Verbindungen pro IP erlauben
limit_conn per_ip 15;           # Standard: 10

# Mehr Gesamtverbindungen erlauben
limit_conn per_server 80;       # Standard: 50
```

Nach Änderungen: `sudo systemctl reload nginx`

### 13.5 Überwachung

```bash
# Aktive Verbindungen anzeigen
sudo netstat -an | grep :80 | wc -l

# Nginx Status (falls aktiviert)
curl http://localhost/nginx_status

# Logs auf 503-Fehler prüfen
sudo grep "503" /var/log/nginx/error.log | tail -20
```

---

## Checkliste vor Inbetriebnahme

- [ ] Raspberry Pi mit Strom versorgt
- [ ] WLAN-Verbindung funktioniert
- [ ] Services laufen (`gunicorn`, `nginx`)
- [ ] HTTPS-Zertifikat erstellt (`/etc/ssl/certs/skiboerse.crt` vorhanden)
- [ ] App über `https://` erreichbar (nicht `http://`)
- [ ] Zertifikat auf allen Handys einmalig akzeptiert
- [ ] Kamerazugriff in der Artikelrückmeldung getestet
- [ ] Admin-Benutzer erstellt
- [ ] Login funktioniert
- [ ] Drucker verbunden und konfiguriert (falls benötigt)
