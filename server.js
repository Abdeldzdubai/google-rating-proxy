// server.js
// Node 18+ requis (fetch natif)

import express from "express";

const app = express();

/**
 * Variables d'environnement attendues sur Render :
 * - GOOGLE_PLACE_ID        (ex: ChIJxxxxxxxxxxxxxxxx)
 * - GOOGLE_MAPS_API_KEY    (clé avec Places API (New) activée + billing)
 * - FRONT_ORIGIN           (optionnel : https://www.votre-site.com pour CORS côté navigateur)
 * - CACHE_TTL_MINUTES      (optionnel : TTL du cache en minutes, défaut 30)
 */
const PLACE_ID = process.env.GOOGLE_PLACE_ID;
const API_KEY  = process.env.GOOGLE_MAPS_API_KEY;
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || ""; // laissez vide si vous n'appelez pas depuis le navigateur
const TTL_MIN = Number(process.env.CACHE_TTL_MINUTES || 30);
const TTL_MS  = TTL_MIN * 60 * 1000;

if (!PLACE_ID || !API_KEY) {
  console.warn("[WARN] Env vars manquantes : GOOGLE_PLACE_ID et/ou GOOGLE_MAPS_API_KEY");
}

// --- CORS (uniquement si appel depuis un autre domaine en client-side) ---
if (FRONT_ORIGIN) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", FRONT_ORIGIN);
    // Optionnel : si vous faites des requêtes avec cookies/headers custom, décommentez :
    // res.setHeader("Access-Control-Allow-Credentials", "true");
    // res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    res.setHeader("Vary", "Origin");
    next();
  });
}

// --- Cache mémoire simple (par instance) ---
let cache = { data: null, expiresAt: 0 };

// Health check
app.get("/", (_req, res) => res.type("text/plain").send("OK"));

// Endpoint principal
app.get("/api/google-rating", async (_req, res) => {
  try {
    const now = Date.now();
    // 1) Servir le cache s'il est valide
    if (cache.data && cache.expiresAt > now) {
      res.set("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=300");
      return res.json(cache.data);
    }

    // 2) Appel Places API (New) v1 - en-têtes recommandés
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}`;
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": API_KEY,
        // Field mask pour ne récupérer que l'essentiel
        "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri"
      }
    });

    if (!r.ok) {
      // Log détaillé pour diagnostiquer (403, etc.)
      let body = "";
      try { body = await r.text(); } catch {}
      console.error("[Places API ERROR]", r.status, body);

      if (cache.data) {
        // Dégrade gracieusement si un ancien cache existe
        res.set("Cache-Control", "no-store");
        return res.json(cache.data);
      }
      return res.status(502).json({ error: "places_api_error", status: r.status });
    }

    const data = await r.json();
    const payload = {
      rating: data?.rating ?? null,                 // ex: 4.8
      count: data?.userRatingCount ?? null,         // ex: 1274
      url: data?.googleMapsUri ?? null              // lien fiche Google
    };

    // 3) Mettre en cache
    cache = { data: payload, expiresAt: now + TTL_MS };

    // 4) Directives de cache côté client/CDN
    res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=300");
    return res.json(payload);

  } catch (e) {
    console.error("[SERVER ERROR]", e);
    if (cache.data) {
      res.set("Cache-Control", "no-store");
      return res.json(cache.data);
    }
    return res.status(500).json({ error: "server_error" });
  }
});

// Démarrage
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
