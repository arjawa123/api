# Supabase Setup

Backend memakai Supabase REST API dengan service role key. Jangan expose service role key ke frontend.

## Environment

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SCHEMA=donation
```

`SUPABASE_SCHEMA=donation` membuat backend mengirim header Supabase REST `Accept-Profile: donation` dan `Content-Profile: donation`.

## Schema

Jalankan SQL berikut di Supabase SQL Editor:

```sql
create schema if not exists donation;

create table if not exists donation.donations (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  transaction_id text,
  donation_name text,
  donation_url text,
  gateway text not null default 'pakasir',
  payment_method text not null default 'qris',
  amount integer not null,
  payable_amount integer,
  status text not null default 'pending',
  donor_name text,
  donor_email text,
  message text,
  qris_string text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_gateway_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists donations_status_idx on donation.donations (status);
create index if not exists donations_created_at_idx on donation.donations (created_at desc);
```

## RLS

Backend memakai service role key, jadi route API bisa berjalan meski RLS aktif. Untuk v1 ini, jangan izinkan insert/update langsung dari frontend.

Rekomendasi:

```sql
alter table donation.donations enable row level security;
```

Tambahkan policy read-only publik nanti jika perlu membuat halaman daftar supporter. Untuk saat ini, frontend tidak membaca Supabase langsung.
