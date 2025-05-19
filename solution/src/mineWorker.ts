import { parentPort } from "worker_threads";
import { createHash } from "crypto";

interface Job {
  prefix: string;
  suffix: string;
  startNonce: string;
  endNonce: string;
  target: string;
}

parentPort!.on("message", (job: Job) => {
  const { prefix, suffix, startNonce, endNonce, target } = job;

  const targetBI = BigInt("0x" + target);
  const start = BigInt(startNonce);
  const end = BigInt(endNonce);
  let nonceBI = start;

  // While not PoW -> Continue
  while (nonceBI <= end) {
    const nonceHex = nonceBI.toString(16).padStart(64, "0");

    const h = createHash("blake2s256");
    h.update(prefix, "utf8");
    h.update(`"nonce":"${nonceHex}"`, "utf8");
    h.update(suffix, "utf8");
    const digestHex = h.digest("hex");

    if (BigInt("0x" + digestHex) < targetBI) {
      parentPort!.postMessage({ type: "found", nonce: nonceHex });
      return;
    }

    nonceBI++;
  }

  parentPort!.postMessage({ type: "error", error: "exhausted nonce space" });
});
