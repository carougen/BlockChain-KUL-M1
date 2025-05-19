/*
USELESS FILE, was here to realize a transaction to the dedicated public
key when enough token on the UTXO. Just sending an object JSON with nc -vvv was easier.
*/

import { logger } from "./logger";
import { globalDatabase, computeObjectId } from "./database";
import { network } from "./network";
import { canonicalize } from "json-canonicalize";
import nacl from "tweetnacl";
import { PRIVATE_KEY_HEX, PUBLIC_KEY_HEX } from "./keys";
import { tryAddToMempool } from "./mempool";
import { globalUTXO } from "./utxo";
import { TransactionValidator } from "./transaction";

// Scan on‐chain UTXOs, build & sign a tx, broadcast it, then
// inject it into our mempool snapshot—without touching globalUTXO.
export async function scanAndSend(
  toPubkey: string,
  amount: bigint
): Promise<void> {
  // Gather our UTXOs from the on‐chain set
  const myUtxos: { outpoint: string; value: bigint }[] = [];
  let balance = BigInt(0);
  for (const [outpoint, utxo] of (globalUTXO as any).utxoMap.entries()) {
    if (utxo.pubkey === PUBLIC_KEY_HEX) {
      const v = BigInt(utxo.value);
      myUtxos.push({ outpoint, value: v });
      balance += v;
    }
  }

  // Check if we can proceed to the payment
  logger.info(
    `🏦 Found balance ${balance} sats across ${myUtxos.length} UTXOs`
  );
  if (balance < amount) {
    logger.warn(`⚠️ Insufficient funds: need ${amount}, have ${balance}`);
    return;
  }

  // Select inputs until we cover the amount
  const inputs: Array<{
    outpoint: { txid: string; index: number };
    sig: string | null;
  }> = [];
  let totalInput = BigInt(0);

  // Iterate Utxo in reverse so we spend the “latest” UTXOs first
  for (const { outpoint, value } of [...myUtxos].reverse()) {
    if (totalInput >= amount) break;
    const [txid, idxStr] = outpoint.split(":");
    inputs.push({ outpoint: { txid, index: Number(idxStr) }, sig: null });
    totalInput += value;
  }

  const change = totalInput - amount;
  logger.info(
    `📝 Building tx: ${inputs.length} inputs (total ${totalInput}), send=${amount}, change=${change}`
  );

  // Construct the unsigned tx
  const tx: any = {
    type: "transaction",
    inputs,
    outputs: [
      { pubkey: toPubkey, value: Number(amount) },
      ...(change > 0
        ? [{ pubkey: PUBLIC_KEY_HEX, value: Number(change) }]
        : []),
    ],
  };

  // Canonicalize and clear signatures
  const txForSig = JSON.parse(JSON.stringify(tx));
  txForSig.inputs.forEach((i: any) => (i.sig = null));
  const toSign = canonicalize(txForSig)!;
  const msgBuf = Buffer.from(toSign, "utf8");

  // Use tweetnacl to derive keypair and sign
  const skBytes = Buffer.from(PRIVATE_KEY_HEX, "hex");
  let keyPair: nacl.SignKeyPair;

  if (skBytes.length === 32) {
    // 32-byte seed only:
    keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(skBytes));
  } else if (skBytes.length === 64) {
    // 64-byte secretKey (seed||pub):
    keyPair = nacl.sign.keyPair.fromSecretKey(new Uint8Array(skBytes));
  } else {
    logger.error(
      `❌ Invalid PRIVATE_KEY_HEX length: expected 32 or 64 bytes, got ${skBytes.length}`
    );
    return;
  }

  const signature = nacl.sign.detached(
    new Uint8Array(msgBuf),
    keyPair.secretKey
  );
  const sigHex = Buffer.from(signature).toString("hex");

  // Stamp that signature into every input
  inputs.forEach((i) => {
    i.sig = sigHex;
  });

  // Final local validation
  const validationError = TransactionValidator.validateTransaction(tx);
  if (validationError) {
    logger.error(
      `❌ Payment transaction invalid after signing: ${validationError}`
    );
    return;
  }

  // Persist, broadcast, inject in mempool
  const txid = computeObjectId(tx);
  globalDatabase.addObject(tx);
  network.broadcast({ type: "ihaveobject", objectid: txid });
  logger.info(`🚀 Broadcasted payment ${txid}`);

  const memErr = tryAddToMempool(txid);
  if (memErr) {
    logger.error(`❌ Could not add payment to mempool: ${memErr}`);
  } else {
    logger.info(`✅ Added our payment ${txid} to mempool`);
  }
}
