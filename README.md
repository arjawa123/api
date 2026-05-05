# XNV Donation Platform

Backend dan frontend donasi universal untuk mendukung developer XNV. Backend memakai Express, Pakasir QRIS, dan Supabase sebagai log donasi. Frontend tunggal memakai Vite React dan ditujukan untuk domain `donation.xnv.my.id`.

## Struktur

```text
.
├── index.js
├── src/
│   ├── server.js
│   ├── modules/
│   │   ├── donations/
│   │   └── payments/gateways/pakasir.js
│   └── shared/
├── frontend/
└── docs/
```

## Setup Backend

```bash
npm install
cp .env.example .env
npm run dev
```

Isi `.env` dengan credential Pakasir dan Supabase:

```env
PAKASIR_PROJECT_SLUG=your-project-slug
PAKASIR_API_KEY=your-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SCHEMA=donation
```

Endpoint health:

```bash
curl http://localhost:3000/api/health
```

## Setup Frontend

```bash
npm install --prefix frontend
cp frontend/.env.example frontend/.env
npm run frontend:dev
```

Isi `frontend/.env`:

```env
VITE_API_BASE_URL=https://api.xnv.biz.id
```

## Scripts

- `npm start`: menjalankan backend production.
- `npm run dev`: menjalankan backend dengan watch mode.
- `npm test`: menjalankan test backend.
- `npm run frontend:dev`: menjalankan frontend Vite.
- `npm run frontend:build`: build frontend static.

## Dokumentasi Lanjutan

- [API](docs/API.md)
- [Pakasir](docs/PAKASIR.md)
- [Supabase](docs/SUPABASE.md)
- [Frontend](frontend/README.md)
