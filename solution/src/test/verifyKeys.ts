import crypto from "crypto";
// import the canonicalize function by name
import { canonicalize } from "json-canonicalize";

import { PUBLIC_KEY_HEX, PRIVATE_KEY_HEX } from "../keys";

/** Convert a hex string to a Buffer */
function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

/** Build a JWK for Ed25519 public key */
function buildJwkPublic(pubBuf: Buffer) {
  return {
    kty: "OKP" as const,
    crv: "Ed25519" as const,
    x: pubBuf.toString("base64url"),
  };
}

/** Build a JWK for Ed25519 private key (seed + pub) */
function buildJwkPrivate(privBuf: Buffer) {
  const seed = privBuf.slice(0, 32);
  const pub = privBuf.slice(32);
  return {
    kty: "OKP" as const,
    crv: "Ed25519" as const,
    x: pub.toString("base64url"),
    d: seed.toString("base64url"),
  };
}

async function main() {
  // 1) Create KeyObjects from JWK
  const publicKeyObject = crypto.createPublicKey({
    key: buildJwkPublic(hexToBuffer(PUBLIC_KEY_HEX)),
    format: "jwk",
  });
  const privateKeyObject = crypto.createPrivateKey({
    key: buildJwkPrivate(hexToBuffer(PRIVATE_KEY_HEX)),
    format: "jwk",
  });

  // 2) Prepare a sample "transaction" for signing
  const tx = {
    inputs: [{ outpoint: { txid: "abc", index: 0 }, sig: null }],
    outputs: [{ pubkey: PUBLIC_KEY_HEX, value: 50 }],
    height: 123,
  };

  // Strip signatures before canonicalizing
  const txForSign = JSON.parse(JSON.stringify(tx));
  txForSign.inputs.forEach((inp: any) => {
    inp.sig = null;
  });

  // 3) Canonicalize & sign
  const msg = canonicalize(txForSign);
  const msgBuf = Buffer.from(msg, "utf8");
  const signature = crypto.sign(null, msgBuf, privateKeyObject);
  console.log("Signature (hex):", signature.toString("hex"));

  // 4) Verify
  const isValid = crypto.verify(null, msgBuf, publicKeyObject, signature);
  console.log("Signature valid?   ", isValid);
}

main().catch((err) => {
  console.error("Error in verifyWithCrypto.ts:", err);
  process.exit(1);
});
