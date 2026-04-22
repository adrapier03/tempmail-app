# Temp Mail App - Reusable/GitHub Notes

File ini buat mode reusable kalau project mau dipush ke GitHub dan dipakai lagi untuk domain lain.

## Goal
Project ini jangan hardcode ke `adrnode.com` terus. Pakai `.env` dan template config supaya bisa dipakai ulang.

## File tambahan
- `.env.example`
- `scripts/bootstrap.sh`
- `scripts/render-config.sh`

## Cara pakai
1. Copy env:
```bash
cp .env.example .env
nano .env
```

2. Isi nilai penting:
- `MAIL_DOMAIN`
- `WEB_HOST`
- `MAIL_HOST`
- `PUBLIC_IP`
- `APP_NAME`

3. Render panduan config:
```bash
./scripts/render-config.sh
```

4. Build app:
```bash
./scripts/bootstrap.sh
```

## Saran sebelum push ke GitHub
- jangan commit `.env`
- jangan commit `storage/data.json` produksi
- jangan commit file certbot / nginx host / postfix host dari mesin live
- bikin `.gitignore` yang rapi

## Yang ideal dibikin berikutnya
- app baca `MAIL_DOMAIN` dan `APP_NAME` dari environment, bukan hardcoded di code
- script generate template nginx/postfix lebih lengkap
- optional install script untuk postfix/nginx/certbot
