// Supabase Edge Function: discord-product-notify
// Configure each webhook as a Supabase Function secret. Never put webhook URLs in HTML/GitHub.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const webhookSecrets: Record<string, string> = {
  "update-and-rework": "WEBHOOK_UPDATE_AND_REWORK",
  "update-sedia": "WEBHOOK_UPDATE_SEDIA",
  "maps-product": "WEBHOOK_MAPS_PRODUCT",
  "system-product": "WEBHOOK_SYSTEM_PRODUCT",
  "model-product": "WEBHOOK_MODEL_PRODUCT",
  "uniforms": "WEBHOOK_UNIFORMS",
  "strobo-vehichle": "WEBHOOK_STROBO_VEHICHLE",
  "police-vehichle": "WEBHOOK_POLICE_VEHICHLE",
  "army-vehichle": "WEBHOOK_ARMY_VEHICHLE",
  "tank": "WEBHOOK_TANK",
  "vehichle": "WEBHOOK_VEHICHLE",
  "discord-product": "WEBHOOK_DISCORD_PRODUCT",
  "cek-eligible": "WEBHOOK_CEK_ELIGIBLE",
  "jasa-dev-komunitas": "WEBHOOK_JASA_DEV_KOMUNITAS",
  "stogra-bot-setup": "WEBHOOK_STOGRA_BOT_SETUP",
  "katalog-stogra-store": "WEBHOOK_KATALOG_STOGRA_STORE",
  // STOGRA CONFIG has no webhook configured yet.
};

const plainTextCategories = new Set(["update-and-rework", "update-sedia"]);

function isAdmin(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const token = authHeader.slice(7);
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return false;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return claims?.app_metadata?.role === "admin";
  } catch {
    return false;
  }
}

function rupiah(value: unknown): string {
  const amount = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(amount)) return "Hubungi staff";
  return "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  if (!isAdmin(req.headers.get("Authorization"))) {
    return Response.json({ error: "Admin only" }, { status: 403, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const p = body?.product;
    const action = body?.action === "updated" ? "DIPERBARUI" : "PRODUK BARU";
    const messageMode = body?.messageMode === "text" ? "text" : "embed";
    const customMessage = typeof body?.discordMessage === "string" ? body.discordMessage.trim().slice(0, 1800) : "";
    if (!p || typeof p.name !== "string" || typeof p.slug !== "string" || typeof p.category !== "string") {
      return Response.json({ error: "Data produk tidak lengkap" }, { status: 400, headers: corsHeaders });
    }

    const secretName = webhookSecrets[p.category];
    if (!secretName) {
      return Response.json({ sent: false, reason: p.category === "STOGRA CONFIG" ? "kategori STOGRA CONFIG belum punya webhook" : "kategori belum dipetakan" }, { headers: corsHeaders });
    }
    const webhook = Deno.env.get(secretName);
    if (!webhook) {
      return Response.json({ sent: false, reason: "webhook kategori belum dipasang di Supabase Secrets" }, { headers: corsHeaders });
    }

    const description = typeof p.description === "string" && p.description.trim() ? p.description.trim().slice(0, 1500) : "Belum ada deskripsi.";
    const embed = {
      title: (action === "DIPERBARUI" ? "✏️ PRODUK DIPERBARUI" : "🆕 PRODUK BARU") + " — " + p.name.slice(0, 180),
      description,
      color: action === "DIPERBARUI" ? 16744507 : 16724027,
      fields: [
        { name: "Kategori", value: p.category.slice(0, 200), inline: true },
        { name: "Harga", value: rupiah(p.price), inline: true },
        { name: "Status katalog", value: String(p.status || "active").slice(0, 50), inline: true },
        { name: "Lihat produk", value: "https://zaquan2110.github.io/stogra-store-simple/#produk", inline: false },
      ],
      footer: { text: "STOGRA STORE • Katalog website adalah sumber data utama" },
      timestamp: new Date().toISOString(),
    } as Record<string, unknown>;
    if (typeof p.image_url === "string" && /^https:\/\//i.test(p.image_url)) {
      embed.thumbnail = { url: p.image_url };
    }

    const target = new URL(webhook);
    target.searchParams.set("wait", "true");
    const payload: Record<string, unknown> = messageMode === "text"\n      ? { content: (customMessage || `**${action}: ${p.name}**\nKategori: ${p.category}\nHarga: ${rupiah(p.price)}\n${description}`).slice(0, 1900) }\n      : { embeds: [embed] };
    if (!plainTextCategories.has(p.category)) {
      // Discord Forum channels require a thread name when creating a new forum post.
      target.searchParams.set("thread_name", (p.name + " • " + p.slug).slice(0, 100));
      if (messageMode === "embed") payload.content = customMessage || ("Diskusi produk: **" + p.name.slice(0, 180) + "**");
    }

    const response = await fetch(target.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.error("Discord webhook failed", p.category, response.status, detail);
      return Response.json({ sent: false, reason: "Discord menolak notifikasi (HTTP " + response.status + ")" }, { headers: corsHeaders });
    }
    return Response.json({ sent: true, category: p.category, action: body.action || "created" }, { headers: corsHeaders });
  } catch (error) {
    console.error("discord-product-notify error", error);
    return Response.json({ sent: false, reason: "fungsi notifikasi mengalami error" }, { status: 500, headers: corsHeaders });
  }
});
