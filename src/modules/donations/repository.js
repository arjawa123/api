export function createDonationRepository(config, fetchImpl = fetch) {
  return {
    async upsertDonation(record) {
      if (!isConfigured(config)) return null;

      return supabaseRequest(fetchImpl, config, "/rest/v1/donations?on_conflict=order_id", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(record)
      });
    },

    async findByOrderId(orderId) {
      if (!isConfigured(config)) return null;

      const rows = await supabaseRequest(
        fetchImpl,
        config,
        `/rest/v1/donations?order_id=eq.${encodeURIComponent(orderId)}&select=*`,
        {
          method: "GET"
        }
      );

      return Array.isArray(rows) ? rows[0] || null : null;
    },

    async updateStatus(orderId, updates) {
      if (!isConfigured(config) || !orderId) return null;

      return supabaseRequest(
        fetchImpl,
        config,
        `/rest/v1/donations?order_id=eq.${encodeURIComponent(orderId)}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            ...updates,
            updated_at: new Date().toISOString()
          })
        }
      );
    }
  };
}

async function supabaseRequest(fetchImpl, config, path, options) {
  const response = await fetchImpl(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Accept-Profile": config.schema || "donation",
      "Content-Type": "application/json",
      "Content-Profile": config.schema || "donation",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Supabase donation repository error:", text);
    return null;
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

function isConfigured(config) {
  if (config?.url && config?.serviceRoleKey) return true;

  console.warn("Supabase donation logging is not configured.");
  return false;
}
