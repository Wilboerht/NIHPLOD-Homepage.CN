import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const CATALOG_MEDIA_TYPE = "application/linkset+json";

function buildCatalog() {
  return {
    linkset: [
      {
        anchor: `${SITE_URL}/api/oauth`,
        "service-desc": [
          {
            href: `${SITE_URL}/api/oauth/docs`,
            type: "application/vnd.oai.openapi+json;version=3.0",
          },
        ],
        "service-doc": [
          {
            href: `${SITE_URL}/api/oauth/docs`,
            type: "application/json",
          },
        ],
        status: [
          {
            href: `${SITE_URL}/api/health`,
            type: "application/json",
          },
        ],
      },
    ],
  };
}

function responseHeaders(): HeadersInit {
  return {
    "Content-Type": CATALOG_MEDIA_TYPE,
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    Link: '</.well-known/api-catalog>; rel="api-catalog"',
  };
}

export async function GET() {
  return new Response(JSON.stringify(buildCatalog()), {
    status: 200,
    headers: responseHeaders(),
  });
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: responseHeaders(),
  });
}
