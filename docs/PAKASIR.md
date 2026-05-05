# Pakasir Integration

Dokumentasi resmi Pakasir: `https://pakasir.com/p/docs`.

## Persiapan

1. Login ke Pakasir.
2. Buat Project.
3. Catat `Slug` dan `API Key`.
4. Isi `.env` backend:

```env
PAKASIR_PROJECT_SLUG=your-project-slug
PAKASIR_API_KEY=your-api-key
```

## Create Transaction QRIS

Backend memakai endpoint:

```http
POST https://app.pakasir.com/api/transactioncreate/qris
```

Payload:

```json
{
  "project": "your-project-slug",
  "order_id": "DONATE-123",
  "amount": 25000,
  "api_key": "your-api-key"
}
```

Field penting response Pakasir:

- `payment.order_id` menjadi `order_id` dan `transaction_id`.
- `payment.amount` menjadi nominal donasi.
- `payment.total_payment` menjadi `payable_amount`.
- `payment.payment_number` menjadi `qris_string`.
- `payment.expired_at` menjadi `expires_at`.

## Transaction Detail

Backend memakai endpoint:

```http
GET https://app.pakasir.com/api/transactiondetail?project={slug}&amount={amount}&order_id={order_id}&api_key={api_key}
```

Dipakai oleh:

- status polling frontend;
- validasi webhook;
- audit status transaksi.

## Webhook URL

Isi webhook URL di dashboard Pakasir:

```text
https://api.xnv.biz.id/api/v2/webhooks/pakasir
```

Pakasir mengirim body seperti:

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

Karena dokumentasi Pakasir tidak mencantumkan signature webhook, backend selalu melakukan server-side verification ke Transaction Detail API sebelum update status.

## Sandbox Simulation

Jika project Pakasir masih sandbox, gunakan Payment Simulation API dari Pakasir untuk men-trigger webhook:

```bash
curl -L 'https://app.pakasir.com/api/paymentsimulation' \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "your-project-slug",
    "order_id": "DONATE-123",
    "amount": 25000,
    "api_key": "your-api-key"
  }'
```
