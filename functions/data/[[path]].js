/**
 * Cloudflare Pages Function — serves files from documaris R2 buckets.
 *
 * Routes:
 *   /data/analytics/* → documaris-dev-public-analytics  (BCA outlet features, compliance summaries)
 */
export async function onRequestGet({ request, env, params }) {
  const parts = params.path || [];
  const role = parts[0];
  const key = parts.slice(1).join("/");

  const bucket = env.DOCUMARIS_DEV_PUBLIC_ANALYTICS;

  if (role !== "analytics" || !bucket) {
    return new Response("Not found", { status: 404 });
  }

  const object = await bucket.get(key);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("Access-Control-Allow-Origin", "*");
  object.writeHttpMetadata(headers);

  return new Response(object.body, { headers });
}
