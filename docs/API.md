# API Documentation

Base URL production disarankan: `https://api.xnv.biz.id`.

## Health

```http
GET /api/health
```

Response:

```json
{
  "ok": true,
  "service": "donation-api",
  "version": "2"
}
```

## Create Donation

Kompatibel v1:

```http
POST /api/donate
```

Endpoint v2:

```http
POST /api/v2/donations
```

Request:

```json
{
  "amount": 25000,
  "donor_name": "Rizal",
  "donor_email": "rizal@example.com",
  "message": "Semangat developernya"
}
```

Response:

```json
{
  "transaction_id": "DONATE-1777980000000-ABC123",
  "order_id": "DONATE-1777980000000-ABC123",
  "amount": 25000,
  "payable_amount": 26003,
  "payment_method": "qris",
  "status": "pending",
  "qris_string": "000201010212...",
  "expires_at": "2026-05-05T12:00:00.000Z",
  "paid_at": null,
  "created_at": "2026-05-05T11:45:00.000Z"
}
```

Frontend membuat QR image dari `qris_string`.

## Check Status

Kompatibel v1:

```http
GET /api/payment-status/:orderId
```

Endpoint v2:

```http
GET /api/v2/donations/:orderId/status
```

Jika Supabase belum aktif, kirim query `amount` agar backend bisa memanggil Pakasir detail:

```http
GET /api/v2/donations/DONATE-123/status?amount=25000
```

Response:

```json
{
  "transaction_id": "DONATE-123",
  "order_id": "DONATE-123",
  "amount": 25000,
  "payable_amount": 26003,
  "payment_method": "qris",
  "status": "paid",
  "qris_string": "000201010212...",
  "expires_at": "2026-05-05T12:00:00.000Z",
  "paid_at": "2026-05-05T12:02:00.000Z",
  "created_at": "2026-05-05T11:45:00.000Z"
}
```

## Webhook Pakasir

```http
POST /api/v2/webhooks/pakasir
```

Body dari Pakasir:

```json
{
  "amount": 25000,
  "order_id": "DONATE-123",
  "project": "your-project-slug",
  "status": "completed",
  "payment_method": "qris",
  "completed_at": "2026-05-05T12:02:00.000+07:00"
}
```

Backend tidak langsung percaya body webhook. Backend memanggil Transaction Detail API Pakasir, lalu hanya mengubah status jika `order_id` dan `amount` cocok.

## Status Values

- `pending`: transaksi dibuat dan belum dibayar.
- `paid`: Pakasir mengembalikan status completed/paid/success.
- `expired`: transaksi kedaluwarsa.
- `failed`: pembayaran gagal.
- `cancelled`: transaksi dibatalkan.

## Error Shape

```json
{
  "error": "Amount is required"
}
```
