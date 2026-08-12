// 伪造 token 生成器：node fake-token.mjs <kind> [userId]
// kind: hs256-wrong-secret | alg-none | rs256-wrong-key | hs256-right-shape
import { SignJWT, generateKeyPair } from "jose";

const [, , kind, userId = "cmsoxym7w001wd0sdgi6uoc4j"] = process.argv;
const base = {
  id: userId,
  client_id: "sso-e2e-test-client",
  scope: "openid profile phone",
  type: "access_token",
  client_type: "user",
};

async function mint() {
  if (kind === "hs256-wrong-secret") {
    const secret = new TextEncoder().encode("attacker-controlled-secret-0123456789abcdef");
    return new SignJWT(base)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("http://127.0.0.1:3000")
      .setAudience("sso-e2e-test-client")
      .setIssuedAt().setExpirationTime("15m").setJti(crypto.randomUUID())
      .sign(secret);
  }
  if (kind === "alg-none") {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      ...base, iss: "http://127.0.0.1:3000", aud: "sso-e2e-test-client",
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900, jti: crypto.randomUUID(),
    })).toString("base64url");
    return `${header}.${payload}.`;
  }
  if (kind === "rs256-wrong-key") {
    const { privateKey } = await generateKeyPair("RS256");
    return new SignJWT(base)
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "access-token-rs256-v1" })
      .setIssuer("http://127.0.0.1:3000")
      .setAudience("sso-e2e-test-client")
      .setIssuedAt().setExpirationTime("15m").setJti(crypto.randomUUID())
      .sign(privateKey);
  }
  throw new Error("unknown kind");
}

console.log(await mint());
