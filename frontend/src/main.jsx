import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const MIN_DONATION_AMOUNT = 1000;
const PRESET_AMOUNTS = [10000, 25000, 50000, 100000];

function App() {
  const [form, setForm] = useState({
    amount: PRESET_AMOUNTS[1],
    customAmount: "",
    donor_name: "",
    isAnonymous: false,
    message: ""
  });
  const messageRef = useRef(null);
  const [payment, setPayment] = useState(null);
  const [qrPreviewDataUrl, setQrPreviewDataUrl] = useState("");
  const [qrDownloadDataUrl, setQrDownloadDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const selectedAmount = useMemo(() => {
    const custom = Number(form.customAmount);
    return custom > 0 ? Math.round(custom) : form.amount;
  }, [form.amount, form.customAmount]);

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      if (!payment?.qris_string) {
        setQrPreviewDataUrl("");
        setQrDownloadDataUrl("");
        return;
      }

      const [previewDataUrl, downloadDataUrl] = await Promise.all([
        createPlainQrisDataUrl(payment.qris_string),
        createDecoratedQrisDataUrl(payment)
      ]);

      if (!cancelled) {
        setQrPreviewDataUrl(previewDataUrl);
        setQrDownloadDataUrl(downloadDataUrl);
      }
    }

    renderQr().catch(() => {
      setQrPreviewDataUrl("");
      setQrDownloadDataUrl("");
    });

    return () => {
      cancelled = true;
    };
  }, [payment?.qris_string]);

  useEffect(() => {
    if (!payment?.order_id || payment.status !== "pending") return undefined;

    const interval = window.setInterval(() => {
      checkStatus({ quiet: true });
    }, 7000);

    return () => window.clearInterval(interval);
  }, [payment?.order_id, payment?.status]);

  useEffect(() => {
    resizeMessageField();
  }, [form.message]);

  async function createDonation(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/donations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: selectedAmount,
          donor_name: form.isAnonymous ? "" : form.donor_name,
          message: form.message
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Donasi belum bisa dibuat.");

      setPayment(result);
    } catch (caughtError) {
      setError(caughtError.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus(options = {}) {
    if (!payment?.order_id) return;

    if (!options.quiet) {
      setChecking(true);
      setError("");
    }

    try {
      const amountQuery = payment.amount ? `?amount=${encodeURIComponent(payment.amount)}` : "";
      const response = await fetch(
        `${API_BASE_URL}/api/v2/donations/${encodeURIComponent(payment.order_id)}/status${amountQuery}`
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Status donasi belum bisa dicek.");

      setPayment((current) => ({ ...current, ...result }));
    } catch (caughtError) {
      if (!options.quiet) setError(caughtError.message);
    } finally {
      if (!options.quiet) setChecking(false);
    }
  }

  function resetDonation() {
    setPayment(null);
    setQrPreviewDataUrl("");
    setQrDownloadDataUrl("");
    setChecking(false);
    setError("");
  }

  function resizeMessageField() {
    const field = messageRef.current;
    if (!field) return;

    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }

  function updateAnonymous(checked) {
    setForm({
      ...form,
      donor_name: checked ? "" : form.donor_name,
      isAnonymous: checked
    });
  }

  return (
    <main className="page-shell">
      <section className="donation-panel">
        <div className="intro">
          <p className="eyebrow">donation.xnv.my.id</p>
          <h1>Dukung developer membangun project yang berguna.</h1>
          <p className="lead">
            Setiap donasi membantu menjaga eksperimen, dokumentasi, dan layanan kecil tetap hidup dan berkembang.
          </p>
          <div className="trust-row">
            <span><ShieldCheck size={16} /> Pembayaran QRIS</span>
            <span><Wallet size={16} /> Rupiah</span>
          </div>
        </div>

        {!payment ? (
          <form className="donation-form" onSubmit={createDonation}>
            <AmountPicker form={form} setForm={setForm} selectedAmount={selectedAmount} />
            <label>
              Nama
              <input
                disabled={form.isAnonymous}
                value={form.donor_name}
                onChange={(event) => setForm({ ...form, donor_name: event.target.value })}
                placeholder={form.isAnonymous ? "Donasi sebagai anonim" : "Nama kamu"}
                maxLength={80}
              />
            </label>
            <label className="checkbox-row">
              <input
                checked={form.isAnonymous}
                onChange={(event) => updateAnonymous(event.target.checked)}
                type="checkbox"
              />
              <span>Tampilkan sebagai anonim</span>
            </label>
            <label>
              Pesan
              <textarea
                ref={messageRef}
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                placeholder="Tulis pesan singkat"
                maxLength={240}
                rows={2}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? (
                <>
                  <Loader2 className="spin" size={18} />
                  Membuat donasi...
                </>
              ) : (
                `Donasi ${formatRupiah(selectedAmount)}`
              )}
            </button>
          </form>
        ) : payment.status === "paid" ? (
          <ThankYouView onReset={resetDonation} payment={payment} />
        ) : (
          <PaymentView
            checking={checking}
            error={error}
            onCheck={() => checkStatus()}
            payment={payment}
            qrDownloadDataUrl={qrDownloadDataUrl}
            qrPreviewDataUrl={qrPreviewDataUrl}
          />
        )}
      </section>
    </main>
  );
}

function ThankYouView({ onReset, payment }) {
  return (
    <section className="thank-you-view">
      <div className="success-mark" aria-hidden="true">
        <CheckCircle2 size={34} />
      </div>
      <div className="thank-you-copy">
        <div className="success-badge">
          <CheckCircle2 size={15} />
          Donasi berhasil
        </div>
        <h2>Terima kasih sudah mendukung.</h2>
        <p>
          Pembayaran sudah diterima. Dukungan kamu membantu project kecil ini tetap berjalan dan terus dirapikan.
        </p>
      </div>
      <div className="thank-you-meta">
        <span>Total donasi</span>
        <strong>{formatRupiah(payment.payable_amount || payment.amount)}</strong>
        <span>Order ID</span>
        <strong>{payment.order_id}</strong>
        {payment.paid_at ? (
          <>
            <span>Dibayar pada</span>
            <strong>{formatDate(payment.paid_at)}</strong>
          </>
        ) : null}
      </div>
      <button className="primary-button" onClick={onReset} type="button">
        Donasi lagi
      </button>
    </section>
  );
}

function AmountPicker({ form, setForm, selectedAmount }) {
  return (
    <fieldset className="amount-picker">
      <legend>Nominal</legend>
      <div className="preset-grid">
        {PRESET_AMOUNTS.map((amount) => (
          <button
            className={form.customAmount === "" && form.amount === amount ? "selected" : ""}
            key={amount}
            onClick={() => setForm({ ...form, amount, customAmount: "" })}
            type="button"
          >
            {formatRupiah(amount)}
          </button>
        ))}
      </div>
      <input
        inputMode="numeric"
        min="1000"
        onChange={(event) => setForm({ ...form, customAmount: event.target.value.replace(/\D/g, "") })}
        placeholder="Masukkan nominal lain"
        value={form.customAmount}
      />
      <p className="amount-note">Minimal donasi {formatRupiah(MIN_DONATION_AMOUNT)}</p>
    </fieldset>
  );
}

function PaymentView({ checking, error, onCheck, payment, qrDownloadDataUrl, qrPreviewDataUrl }) {
  const isPaid = payment.status === "paid";
  const downloadReady = Boolean(qrDownloadDataUrl);

  return (
    <section className="payment-view">
      <div className={`status-pill ${payment.status}`}>
        {isPaid ? <CheckCircle2 size={16} /> : <RefreshCw size={16} />}
        {statusLabel(payment.status)}
      </div>
      <div className="qr-box">
        {qrPreviewDataUrl ? <img alt="QRIS donasi" src={qrPreviewDataUrl} /> : <Loader2 className="spin" size={32} />}
      </div>
      <div className="payment-meta">
        <span>Order ID</span>
        <strong>{payment.order_id}</strong>
        <span>Total bayar</span>
        <strong>{formatRupiah(payment.payable_amount || payment.amount)}</strong>
      </div>
      {payment.expires_at ? <p className="muted">Berlaku sampai {formatDate(payment.expires_at)}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      <div className="action-row">
        <button className="secondary-button" disabled={checking || isPaid} onClick={onCheck} type="button">
          {checking ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          Cek Status
        </button>
        <a
          aria-disabled={!downloadReady}
          className={`text-button ${downloadReady ? "" : "disabled"}`}
          download={`qris-${payment.order_id || "donasi"}.png`}
          href={qrDownloadDataUrl || undefined}
        >
          Download QRIS
        </a>
      </div>
    </section>
  );
}

function createPlainQrisDataUrl(qrisString) {
  return QRCode.toDataURL(qrisString, {
    width: 280,
    margin: 2,
    color: {
      dark: "#111111",
      light: "#ffffff"
    }
  });
}

async function createDecoratedQrisDataUrl(payment) {
  const qrDataUrl = await QRCode.toDataURL(payment.qris_string, {
    width: 360,
    margin: 2,
    color: {
      dark: "#111111",
      light: "#ffffff"
    }
  });
  const qrImage = await loadImage(qrDataUrl);
  const canvas = document.createElement("canvas");
  const scale = 2;
  const width = 520;
  const height = 720;
  const ctx = canvas.getContext("2d");

  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, width, height);
  roundedRect(ctx, 28, 28, width - 56, height - 56, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#d7d7d7";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#111111";
  ctx.font = "700 18px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("donation.xnv.my.id", width / 2, 82);

  ctx.font = "800 34px Inter, Arial, sans-serif";
  ctx.fillText(formatRupiah(payment.payable_amount || payment.amount), width / 2, 132);

  ctx.fillStyle = "#666666";
  ctx.font = "500 16px Inter, Arial, sans-serif";
  ctx.fillText("Scan QRIS untuk menyelesaikan donasi", width / 2, 164);

  roundedRect(ctx, 80, 200, 360, 360, 14);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e1e1e1";
  ctx.stroke();
  ctx.drawImage(qrImage, 100, 220, 320, 320);

  ctx.fillStyle = "#f5f5f5";
  roundedRect(ctx, 58, 592, width - 116, 74, 12);
  ctx.fill();
  ctx.fillStyle = "#666666";
  ctx.font = "600 13px Inter, Arial, sans-serif";
  ctx.fillText("ORDER ID", width / 2, 624);
  ctx.fillStyle = "#111111";
  ctx.font = "700 15px Inter, Arial, sans-serif";
  fitText(ctx, payment.order_id || "-", width / 2, 650, width - 150);

  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, x, y, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }

  let clipped = text;
  while (clipped.length > 4 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  ctx.fillText(`${clipped}...`, x, y);
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusLabel(status) {
  if (status === "paid") return "Terbayar";
  if (status === "expired") return "Kedaluwarsa";
  if (status === "failed") return "Gagal";
  if (status === "cancelled") return "Dibatalkan";
  return "Menunggu Pembayaran";
}

createRoot(document.getElementById("root")).render(<App />);
