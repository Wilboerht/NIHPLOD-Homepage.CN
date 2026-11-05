const BRAND_REDIRECTS: Record<string, string> = {
  旎白: "/",
  旎珀: "/",
  旎泊: "/",
  尼柏: "/",
  你播: "/",
};

function normalize(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  return decoded.replace(/^\/+|\/+$/g, "");
}

export function getBrandRedirectTarget(pathname: string): string | null {
  return BRAND_REDIRECTS[normalize(pathname)] ?? null;
}
