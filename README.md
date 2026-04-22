# Temp Mail App

Self-hosted disposable/temp mail app dengan:
- Web UI di `https://webmx.example.com`
- MX / inbound mail di `mx.example.com`
- Backend Node.js + Express
- Reverse proxy Nginx + Let's Encrypt SSL
- Postfix receive-only
- Inbound email dipipe ke app lalu disimpan ke storage JSON

Dokumen ini merangkum setup final yang dipakai sampai berhasil.

---

## 1. Arsitektur

### Domain / subdomain
- `webmx.example.com` → web UI temp mail
- `mx.example.com` → mail receiver / MX
- `example.com` → domain utama email disposable (`*@example.com`)

### Flow email
1. Orang kirim email ke `apaaja@example.com`
2. DNS MX mengarah ke `mx.example.com`
3. Postfix menerima email di server
4. Postfix meneruskan raw email ke script ingest Node (`tempmailpipe`)
5. `ingest.js` parse email dan simpan ke `storage/data.json`
6. Web UI menampilkan inbox sesuai browser session

### Flow web app
- Browser mendapat `sessionId` anonim
- `sessionId` disimpan di `localStorage`
- Inbox list bersifat **per browser/session**
- Email tetap disimpan global di server
- Tombol **Create** bisa membuka inbox lama di session/browser lain
- Tombol **Random** selalu membuat inbox human-like yang fresh/unik

---

## 2. Struktur project

Path project final:
- `/opt/tempmail-app`

Struktur:
- `server/index.js` → API Express
- `server/ingest.js` → parser email dari Postfix pipe
- `server/postfix-ingest.sh` → wrapper shell untuk Postfix
- `web/` → frontend statis
- `storage/data.json` → storage inbox/messages/sessions
- `Dockerfile`
- `docker-compose.yml`

---

## 3. Requirement server

OS yang dipakai saat setup berhasil:
- Ubuntu 24.04 LTS

Tools yang dipakai:
- Docker
- Docker Compose
- Nginx
- Certbot
- Postfix
- Node runtime (dipakai di dalam container dan untuk ingest via binary host)

---

## 4. DNS / Domain setup (Cloudflare)

> Gunakan `mail` untuk MX/mail receiver, dan `tempmail` untuk web UI.

### Record yang dipakai

#### Web UI
- Type: `A`
- Name: `tempmail`
- IPv4: `YOUR.SERVER.IP`
- Proxy: **Proxied**

#### Mail receiver
- Type: `A`
- Name: `mail`
- IPv4: `YOUR.SERVER.IP`
- Proxy: **DNS only**

#### MX
- Type: `MX`
- Name: `@`
- Mail server: `mx.example.com`
- Priority: `10`

#### SPF
- Type: `TXT`
- Name: `@`
- Content:

```txt
v=spf1 mx ip4:YOUR.SERVER.IP ~all
```

### Penting
Kalau sebelumnya memakai **Cloudflare Email Routing**:
- matikan Email Routing dulu
- hapus MX `route1/2/3.mx.cloudflare.net`
- baru ganti ke MX sendiri (`mx.example.com`)

### Catatan Cloudflare
- `mx.example.com` **harus DNS only**
- jangan proxied untuk SMTP/MX

---

## 5. Deploy aplikasi (Docker)

### Dockerfile
Sudah ada di project.

### docker-compose.yml
Konfigurasi final bind app ke localhost saja:

```yaml
services:
  tempmail-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: tempmail-app
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
    volumes:
      - ./storage:/app/storage
```

### Build dan jalankan
```bash
cd /opt/tempmail-app
docker compose up -d --build
```

### Cek status
```bash
docker ps
curl http://127.0.0.1:3001
```

---

## 6. Nginx reverse proxy

File vhost final:
- `/etc/nginx/sites-available/webmx.example.com`

Isi final yang aktif:

```nginx
server {
    server_name webmx.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/webmx.example.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/webmx.example.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = webmx.example.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name webmx.example.com;
    return 404; # managed by Certbot
}
```

### Aktifkan site
```bash
ln -s /etc/nginx/sites-available/webmx.example.com /etc/nginx/sites-enabled/webmx.example.com
/usr/sbin/nginx -t
systemctl reload nginx
```

---

## 7. SSL (Let's Encrypt)

### Jika plugin nginx belum ada
```bash
apt-get update
apt-get install -y python3-certbot-nginx
```

### Issue certificate
```bash
certbot --nginx -d webmx.example.com
```

Kalau sukses, Certbot otomatis:
- membuat cert
- inject config SSL ke Nginx
- menambahkan redirect HTTP → HTTPS

---

## 8. Setup Postfix (receive-only)

### Install
Saat prompt installer:
- pilih **Internet Site**
- system mail name: `mx.example.com`

```bash
apt-get update
apt-get install -y postfix
```

### Set hostname server
```bash
hostnamectl set-hostname mx.example.com
printf "127.0.0.1 localhost\n127.0.1.1 mx.example.com mail\n" > /etc/hosts
hostname -f
```

Output ideal:
```bash
mx.example.com
```

### Konfigurasi utama Postfix
```bash
postconf -e "myhostname = mx.example.com"
postconf -e "mydomain = example.com"
postconf -e "myorigin = \$mydomain"
postconf -e "inet_interfaces = all"
postconf -e "inet_protocols = ipv4"
postconf -e "mydestination = localhost, localhost.localdomain"
postconf -e "virtual_alias_domains = example.com"
postconf -e "virtual_alias_maps = regexp:/etc/postfix/virtual_alias_regexp"
postconf -e "local_recipient_maps ="
postconf -e "smtpd_recipient_restrictions = permit_mynetworks,reject_unauth_destination"
postconf -e "transport_maps = hash:/etc/postfix/transport"
postfix reload
```

### Alias map final
Semua email `*@example.com` diarahkan ke recipient virtual internal:

```bash
cat >/etc/postfix/virtual_alias_regexp <<'EOF'
/^.+@adrnode\.com$/ tempmail-inbox@pipe.adrnode
EOF
```

### Transport map final
Domain virtual internal `pipe.adrnode` diarahkan ke service `tempmailpipe`:

```bash
cat >/etc/postfix/transport <<'EOF'
pipe.adrnode tempmailpipe:
EOF

postmap /etc/postfix/transport
postfix reload
```

---

## 9. Pipe Postfix ke app

### Wrapper script
File:
- `/opt/tempmail-app/server/postfix-ingest.sh`

Isi final:

```bash
#!/bin/bash
set -euo pipefail
cd /opt/tempmail-app/server
exec /usr/local/bin/node /opt/tempmail-app/server/ingest.js "$1"
```

Pastikan executable:
```bash
chmod +x /opt/tempmail-app/server/postfix-ingest.sh
```

### Binary node host
Karena Postfix pipe jalan sebagai user non-root (`tempmail`) dan tidak bisa mengakses NVM di `/root/.nvm/...`, binary `node` dicopy ke `/usr/local/bin/node`:

```bash
cp /root/.nvm/versions/node/v24.14.0/bin/node /usr/local/bin/node
chmod 755 /usr/local/bin/node
```

### Service di `master.cf`
Tambahkan di bawah file `/etc/postfix/master.cf`:

```conf
tempmailpipe unix  -       n       n       -       -       pipe
  flags=Rq user=tempmail argv=/opt/tempmail-app/server/postfix-ingest.sh ${original_recipient}
```

Reload Postfix:
```bash
postfix reload
```

### Kenapa `user=tempmail`, bukan `root`
Postfix akan reject kalau pipe service jalan sebagai root:
- error yang muncul: `fatal: user= command-line attribute specifies root privileges`

Karena itu service pipe harus jalan sebagai user non-root (`tempmail`).

---

## 10. Ingest logic yang akhirnya berhasil

`ingest.js` harus membaca recipient asli dari argument Postfix `${original_recipient}`.

Sebelum fix, error yang muncul:
- `No recipient found in message`

Setelah fix, logic final:
- baca raw mail dari stdin
- baca `process.argv[2]` sebagai original recipient
- fallback ke parsing header jika perlu
- simpan ke `storage/data.json`

Bukti sukses di log Postfix:

```txt
status=sent (delivered via tempmailpipe service (Stored message for abc@example.com))
```

---

## 11. Session browser / isolasi inbox

Agar inbox list tidak global untuk semua orang, app memakai **anonymous session token per browser**.

### Cara kerja
- browser request `/api/session`
- server membuat `sessionId`
- browser menyimpan `sessionId` di `localStorage`
- request API berikutnya mengirim header `x-session-id`
- inbox list yang ditampilkan hanya inbox milik session itu

### Implikasi
- Browser A bikin inbox → hanya Browser A yang lihat
- Browser B / incognito → kosong
- Browser A refresh → inbox tetap ada

### Create vs Random
#### Create / custom
- bisa membuka inbox yang sudah ada
- berguna untuk membuka kembali inbox dari session/browser lain

#### Random
- sekarang human-like
- sekarang **selalu unik/fresh**
- tidak akan attach ke inbox lama yang sudah pernah ada

---

## 12. Random username generator

Random awal terlalu machine-like:
- contoh: `e21uk574to@example.com`

Generator kemudian diubah menjadi human-like:
- contoh: `langitbiru23@example.com`
- contoh: `kopihujan41@example.com`

Lalu diperbaiki lagi agar **selalu unik**:
- generate candidate human-like
- cek terhadap `data.inboxes`
- kalau sudah pernah ada → generate ulang
- fallback pakai suffix tambahan kalau perlu

---

## 13. Test yang dipakai saat debugging

### Cek DNS
```bash
dig +short mx.example.com A
dig +short example.com MX
```

### Cek port SMTP
```bash
ss -tulpn | grep ':25 '
```

### Cek queue Postfix
```bash
postqueue -p
mailq
```

### Cek map Postfix
```bash
postmap -q test@example.com regexp:/etc/postfix/virtual_alias_regexp
postmap -q pipe.adrnode hash:/etc/postfix/transport
```

### Test kirim email lokal
```bash
printf "Subject: test masuk app\n\nhalo dari postfix ke app\n" | sendmail abc@example.com
```

### Cek log Postfix
```bash
journalctl -n 120 --no-pager | grep -iE 'postfix|tempmail|ingest'
```

### Cek storage aplikasi
```bash
cat /opt/tempmail-app/storage/data.json
```

---

## 14. Trouble notes / error yang sempat muncul

### 1. Port 3001 bentrok
Penyebab:
- app Node lama masih jalan manual di host

Fix:
- kill proses lama
- biarkan Docker yang bind ke `127.0.0.1:3001`

### 2. `certbot --nginx` gagal
Penyebab:
- plugin nginx belum terinstall

Fix:
```bash
apt-get install -y python3-certbot-nginx
```

### 3. MX Cloudflare terkunci
Penyebab:
- Cloudflare Email Routing masih aktif

Fix:
- disable Email Routing dulu
- lalu ganti MX ke `mx.example.com`

### 4. Pipe Postfix ditolak
Error:
```txt
fatal: user= command-line attribute specifies root privileges
```

Fix:
- jangan pakai `user=root`
- pakai `user=tempmail`

### 5. Binary node tidak ketemu
Error:
```txt
/opt/tempmail-app/server/postfix-ingest.sh: line 4: /usr/bin/node: No such file or directory
```

Fix:
- copy binary ke `/usr/local/bin/node`
- update `postfix-ingest.sh`

### 6. Recipient tidak kebaca
Error:
```txt
Error: No recipient found in message
```

Fix:
- pass `${original_recipient}` dari `master.cf`
- baca di `process.argv[2]` pada `ingest.js`

---

## 15. Command ringkas deploy ulang dari nol

### App
```bash
cd /opt/tempmail-app
docker compose up -d --build
```

### Nginx
```bash
ln -s /etc/nginx/sites-available/webmx.example.com /etc/nginx/sites-enabled/webmx.example.com
/usr/sbin/nginx -t
systemctl reload nginx
```

### SSL
```bash
apt-get update
apt-get install -y python3-certbot-nginx
certbot --nginx -d webmx.example.com
```

### Postfix map
```bash
postmap /etc/postfix/transport
postfix reload
```

### Test email lokal
```bash
printf "Subject: test masuk app final\n\nhalo dari postfix ke app final\n" | sendmail abc@example.com
sleep 2
cat /opt/tempmail-app/storage/data.json
```

---

## 16. Status fitur saat ini

### Sudah jalan
- temp mail web UI
- HTTPS via Nginx + Certbot
- browser-scoped inbox list (session token)
- Create/open inbox existing
- Random inbox human-like dan unik
- Postfix receive-only
- MX custom ke VPS
- inbound email dipipe ke app
- email tersimpan di `storage/data.json`

### Belum / next improvement
- auto refresh inbox
- filter MAILER-DAEMON / bounce
- attachment parsing
- HTML email rendering
- migrate ke SQLite/Postgres
- expiry/cleanup inbox lama
- admin tooling

---

## 17. File penting yang perlu diingat

### App
- `/opt/tempmail-app/server/index.js`
- `/opt/tempmail-app/server/ingest.js`
- `/opt/tempmail-app/server/postfix-ingest.sh`
- `/opt/tempmail-app/storage/data.json`
- `/opt/tempmail-app/docker-compose.yml`

### Nginx
- `/etc/nginx/sites-available/webmx.example.com`
- `/etc/nginx/sites-enabled/webmx.example.com`

### Postfix
- `/etc/postfix/main.cf`
- `/etc/postfix/master.cf`
- `/etc/postfix/virtual_alias_regexp`
- `/etc/postfix/transport`
- `/etc/postfix/transport.db`

---

## 18. Saran operasional

### Reload / restart yang sering dipakai
#### App
```bash
cd /opt/tempmail-app
docker compose up -d --build
```

#### Nginx
```bash
/usr/sbin/nginx -t
systemctl reload nginx
```

#### Postfix
```bash
postfix reload
```

### Cek queue / log
```bash
postqueue -p
journalctl -n 120 --no-pager | grep -iE 'postfix|tempmail|ingest'
```

---

## 19. Catatan keamanan

Saat ini sistem ini cocok untuk:
- receive-only temp mail
- eksperimen / penggunaan personal

Belum cocok untuk publik besar tanpa tambahan:
- rate limit
- abuse protection
- cleanup policy
- attachment handling yang aman
- database / concurrency yang lebih kuat

---

## 20. Quick verification akhir

### Web
Buka:
- `https://webmx.example.com`

### Test create
- buat inbox custom, misal `hitamnyaaku`
- inbox harus attach/buka kalau sudah pernah ada

### Test random
- klik random
- hasil harus human-like dan unik

### Test email lokal
```bash
printf "Subject: test final\n\nhalo final\n" | sendmail testfinal@example.com
```

### Test email luar
- kirim dari Gmail / provider lain ke alamat `*@example.com`
- buka inbox address itu dari web

Jika email masuk dan muncul di inbox, setup berhasil.
