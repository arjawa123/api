# Universal Donation Frontend

Frontend Vite React untuk `donation.xnv.my.id`.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Environment:

```env
VITE_API_BASE_URL=https://api.xnv.biz.id
```

## Build

```bash
npm run build
```

Output static ada di `frontend/dist`.

## Deploy ke donation.xnv.my.id

1. Build frontend:

```bash
npm run build
```

2. Upload isi folder `dist/` ke document root domain `donation.xnv.my.id`.
3. Pastikan backend `CORS_ORIGIN` berisi:

```env
CORS_ORIGIN=https://donation.xnv.my.id
```

## Flow UI

1. Donatur memilih nominal atau mengisi nominal custom.
2. Donatur mengisi nama, email, dan pesan opsional.
3. Frontend memanggil `POST /api/v2/donations`.
4. Frontend membuat QR image dari `qris_string`.
5. Frontend polling `GET /api/v2/donations/:orderId/status`.
6. UI berubah ke status paid, expired, failed, atau cancelled.
