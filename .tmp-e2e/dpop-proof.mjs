// 生成 DPoP proof：node dpop-proof.mjs <htu> <jti> [htm]
import { SignJWT, generateKeyPair, exportJWK } from "jose";
const [, , htu, jti, htm = "POST"] = process.argv;
const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const jwk = await exportJWK(publicKey);
jwk.alg = "ES256"; jwk.use = "sig";
const jwt = await new SignJWT({ htm, htu, jti })
  .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk })
  .setIssuedAt().sign(privateKey);
console.log(jwt);
