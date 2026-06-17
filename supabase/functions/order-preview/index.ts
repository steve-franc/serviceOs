// Public edge function that serves rich link previews for the public order page.
// - Bots (Facebook, WhatsApp, Twitter, LinkedIn, Slack, Discord, Telegram, etc.)
//   receive an HTML page with restaurant-specific Open Graph tags.
// - Humans get a 302 redirect to the live public ordering page.
//
// URL shape: /functions/v1/order-preview/<restaurantId>
// Optional query: ?to=<absolute-app-origin>  (defaults to APP_ORIGIN env or serviceos.lovable.app)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_APP_ORIGIN =
  Deno.env.get("APP_ORIGIN") ?? "https://serviceos.lovable.app";

const BOT_UA = /bot|facebookexternalhit|facebot|twitterbot|slackbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview|embedly|pinterest|redditbot|applebot|vkshare|w3c_validator|quora link preview|preview|fetch|crawler|spider|curl|wget|httpclient|metainspector|iframely/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function previewHtml(opts: {
  title: string;
  description: string;
  image?: string | null;
  url: string;
}) {
  const { title, description, image, url } = opts;
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const imageTags = image
    ? `
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />`
    : `<meta name="twitter:card" content="summary" />`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}" />
<link rel="canonical" href="${safeUrl}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${safeTitle}" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:url" content="${safeUrl}" />
${imageTags}
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta http-equiv="refresh" content="0; url=${safeUrl}" />
</head>
<body>
<p>Redirecting to <a href="${safeUrl}">${safeTitle}</a>…</p>
<script>window.location.replace(${JSON.stringify(url)});</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Extract restaurantId — last non-empty segment after the function name
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("order-preview");
  const restaurantId =
    (idx >= 0 ? parts[idx + 1] : parts[parts.length - 1]) ?? "";
  const appOrigin = (url.searchParams.get("to") ?? DEFAULT_APP_ORIGIN).replace(
    /\/+$/,
    ""
  );
  const targetUrl = `${appOrigin}/order/${restaurantId}`;

  const ua = req.headers.get("user-agent") ?? "";
  const isBot = BOT_UA.test(ua);

  // Humans → straight redirect, no preview HTML needed.
  if (!isBot || !restaurantId) {
    return new Response(null, {
      status: 302,
      headers: { Location: targetUrl, "Cache-Control": "no-store" },
    });
  }

  // Bots → fetch restaurant info and render preview HTML.
  let title = "Order online";
  let description = "Browse the menu and place your order online.";
  let image: string | null = null;

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    const { data } = await supabase
      .from("restaurant_settings")
      .select("restaurant_name, logo_url")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (data?.restaurant_name) {
      title = `${data.restaurant_name} — Order online`;
      description = `Browse the menu and place your order from ${data.restaurant_name} directly — no sign-in required.`;
    }
    if (data?.logo_url) image = data.logo_url;
  } catch (_e) {
    // fall back to defaults
  }

  return new Response(
    previewHtml({ title, description, image, url: targetUrl }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
});
