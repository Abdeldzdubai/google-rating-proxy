import express from "express";

const app = express();

// --- REMPLI PAR RENDER via variables d'environnement ---
const PLACE_ID = process.env.GOOGLE_PLACE_ID;
const API_KEY  = process.env.GOOGLE_MAPS_API_KEY;

// (Optionnel) CORS si ton site appelle l'API depuis un autre domaine.
// Si tu fais un appel côté serveur (SSR) tu peux supprimer ce bloc.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://www.votre-site.com"); // remplace par TOn domaine si appel côté navigateur
  res.setHeader("Vary", "Origin");
  next();
});

// --- Cache mémoire simple (par instance Render) ---
let cache = { data: null, expiresAt: 0 };
const TTL_MS = 30 * 60 * 1000; // 30 minutes

app.get("/api/google-rating", async (_req, res) => {
  try {
    const now = Date.now();
    if (cache.data && cache.expiresAt > now) {
      res.set("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=300");
      return res.json(cache.data);
    }

    // Appel officiel Places API (New) v1 — champs strictement nécessaires
    const endpoint = `https://places.googleapis.com/v1/places/${PLACE_ID}?fields=rating,userRatingCount,googleMapsUri&key=${API_KEY}`;
    const r = await fetch(endpoint);

    if (!r.ok) {
      // En cas d'erreur Google, renvoyer l'ancien cache s'il existe
      if (cache.data) {
        res.set("Cache-Control", "no-store");
        return res.json(cache.data);
      }
      return res.status(502).json({ error: "places_api_error", status: r.status });
    }

    const data = await r.json();
    const payload = {
      rating: data.rating,             // ex: 4.8
      count: data.userRatingCount,     // ex: 1274
      url: data.googleMapsUri          // lien vers la fiche Google
    };

    // Mettre en cache
    cache = { data: payload, expiresAt: now + TTL_MS };

    // Headers de cache côté client/CDN
    res.set("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=300");
    return res.json(payload);
  } catch (e) {
    if (cache.data) {
      res.set("Cache-Control", "no-store");
      return res.json(cache.data);
    }
    return res.status(500).json({ error: "server_error" });
  }
});

// Route de santé
app.get("/", (_req, res) => res.send("OK"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
