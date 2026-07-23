import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { signWithRSA2, verifyWithRSA2, buildSignContent } from "@/lib/alipay";
import { toPrivateKeyPem, toPublicKeyPem, formatKey } from "@/lib/crypto-utils";

let privateKeyPem: string;
let publicKeyPem: string;
let privateKeyBare: string;
let publicKeyBare: string;

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  privateKeyPem = privateKey;
  publicKeyPem = publicKey;
  privateKeyBare = formatKey(privateKey)
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");
  publicKeyBare = formatKey(publicKey)
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\n/g, "");
});

describe("alipay RSA2 签名与验签", () => {
  it("应支持完整 PEM 格式私钥签名、完整 PEM 格式公钥验签", () => {
    const content = "app_id=123&method=test";
    const sign = signWithRSA2(content, toPrivateKeyPem(privateKeyPem));
    expect(sign.length).toBeGreaterThan(0);
    expect(verifyWithRSA2(content, sign, toPublicKeyPem(publicKeyPem))).toBe(true);
  });

  it("应支持纯 base64 body 私钥签名、纯 base64 body 公钥验签", () => {
    const content = "app_id=456&method=demo";
    const sign = signWithRSA2(content, toPrivateKeyPem(privateKeyBare));
    expect(verifyWithRSA2(content, sign, toPublicKeyPem(publicKeyBare))).toBe(true);
  });

  it("应拒绝错误的公钥验签", () => {
    const { publicKey: otherPublicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    const content = "app_id=789&method=hack";
    const sign = signWithRSA2(content, toPrivateKeyPem(privateKeyPem));
    expect(verifyWithRSA2(content, sign, toPublicKeyPem(otherPublicKey))).toBe(false);
  });

  it("buildSignContent 应正确生成待签名字符串", () => {
    const params: Record<string, string> = {
      z_key: "last",
      a_key: "first",
      empty: "",
      null_val: "null",
      undefined_val: "undefined",
      normal: "value",
    };
    const content = buildSignContent(params);
    expect(content).toBe("a_key=first&normal=value&z_key=last");
  });
});
