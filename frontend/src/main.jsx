import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { CheckCircle2, Heart, Loader2, RefreshCw, Send, ShieldCheck, Wallet } from "lucide-react";
import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const PRESET_AMOUNTS = [10000, 25000, 50000, 100000];

function App() {
  const [form, setForm] = useState({
    amount: PRESET_AMOUNTS[1],
    customAmount: "",
    donor_name: "",
    donor_email: "",
    message: ""
  });
  const [payment, setPayment] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
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
        setQrDataUrl("");
        return;
      }

      const dataUrl = await QRCode.toDataURL(payment.qris_string, {
        width: 280,
        margin: 2,
        color: {
          dark: "#13201a",
          light: "#ffffff"
        }
      });

      if (!cancelled) setQrDataUrl(dataUrl);
    }

    renderQr().catch(() => setQrDataUrl(""));

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
          donor_name: form.donor_name,
          donor_email: form.donor_email,
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
    setQrDataUrl("");
    setError("");
  }

  return (
    <main className="page-shell">
      <section className="donation-panel">
        <div className="intro">
          <div className="brand-mark" aria-hidden="true">
            <Heart size={24} />
          </div>
          <p className="eyebrow">donation.xnv.my.id</p>
          <h1>Dukung developer membangun project yang berguna.</h1>
          <p className="lead">
            Setiap donasi membantu menjaga eksperimen, dokumentasi, dan layanan kecil tetap hidup dan berkembang.
          </p>
          <div className="trust-row">
            <span><ShieldCheck size={16} /> QRIS via Pakasir</span>
            <span><Wallet size={16} /> Rupiah</span>
          </div>
        </div>

        {!payment ? (
          <form className="donation-form" onSubmit={createDonation}>
            <AmountPicker form={form} setForm={setForm} selectedAmount={selectedAmount} />
            <label>
              Nama
              <input
                value={form.donor_name}
                onChange={(event) => setForm({ ...form, donor_name: event.target.value })}
                placeholder="Nama kamu"
                maxLength={80}
              />
            </label>
            <label>
              Email
              <input
                value={form.donor_email}
                onChange={(event) => setForm({ ...form, donor_email: event.target.value })}
                placeholder="email@domain.com"
                maxLength={254}
                type="email"
              />
            </label>
            <label>
              Pesan
              <textarea
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                placeholder="Tulis pesan singkat"
                maxLength={240}
                rows={4}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              Buat Donasi
            </button>
          </form>
        ) : (
          <PaymentView
            checking={checking}
            error={error}
            onCheck={() => checkStatus()}
            onReset={resetDonation}
            payment={payment}
            qrDataUrl={qrDataUrl}
          />
        )}
      </section>
    </main>
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
        placeholder="Nominal lain"
        value={form.customAmount}
      />
      <p className="amount-note">Total: {formatRupiah(selectedAmount)}</p>
    </fieldset>
  );
}

function PaymentView({ checking, error, onCheck, onReset, payment, qrDataUrl }) {
  const isPaid = payment.status === "paid";
  const isExpired = payment.status === "expired";

  return (
    <section className="payment-view">
      <div className={`status-pill ${payment.status}`}>
        {isPaid ? <CheckCircle2 size={16} /> : <RefreshCw size={16} />}
        {statusLabel(payment.status)}
      </div>
      <div className="qr-box">
        {qrDataUrl ? <img alt="QRIS donasi" src={qrDataUrl} /> : <Loader2 className="spin" size={32} />}
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
        <button className="text-button" onClick={onReset} type="button">
          {isExpired ? "Buat ulang" : "Donasi lagi"}
        </button>
      </div>
    </section>
  );
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
