import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import { canonicalize } from "json-canonicalize";

import {
  initMempoolFromChain,
  mempoolTxIds,
  updateMempoolOnBlock,
} from "./mempool";
import { globalDatabase, computeObjectId } from "./database";
import { BlockValidator, REQUIRED_TARGET, blockHeights } from "./block";
import { network } from "./network";
import { PUBLIC_KEY_DEST, PUBLIC_KEY_HEX } from "./keys";
import { scanAndSend } from "./payments";
import { logger } from "./logger";
import { UTXOSet, globalUTXO } from "./utxo";

const COINBASE_REWARD = BigInt(50) * BigInt(10) ** BigInt(12);

interface BlockTemplate {
  T: string;
  created: number;
  miner: string;
  studentids: string[];
  previd: string | null;
  txids: string[];
  type: "block";
  nonce?: string;
}

interface CoinbaseTx {
  type: "transaction";
  height: number;
  outputs: { pubkey: string; value: number }[];
}

function makeCoinbaseTx(height: number): CoinbaseTx {
  return {
    type: "transaction",
    height,
    outputs: [{ pubkey: PUBLIC_KEY_HEX, value: Number(COINBASE_REWARD) }],
  };
}

export async function startMiner(): Promise<never> {
  // Determine how many workers we can launch
  const PARALLEL = os.cpus().length;

  // Load our UTXO snapshot for mempool
  initMempoolFromChain();

  while (true) {
    // Get current tip and height
    const parentTip = globalDatabase.getChainTip();
    const parentHeight = parentTip ? blockHeights.get(parentTip)! : -1;
    const nextHeight = parentHeight + 1;

    // Build our coinbase transaction
    const coinbaseTx = makeCoinbaseTx(nextHeight);
    const coinbaseId = computeObjectId(coinbaseTx);

    // Include all mempool transactions<
    const txids = [coinbaseId, ...mempoolTxIds];

    // Create the block template with an empty nonce
    const templateNoNonce: BlockTemplate = {
      T: REQUIRED_TARGET,
      created: Math.floor(Date.now() / 1000),
      miner: "B1",
      studentids: ["r1028730", "r1041960"],
      previd: parentTip,
      txids: txids,
      type: "block",
      nonce: "",
    };

    // Canonicalize & split around the nonce field
    const noNonceJSON = canonicalize(templateNoNonce)!;
    const [prefix, rest] = noNonceJSON.split(`"nonce":""`);
    const suffix = rest;

    logger.debug(
      `🧩 Mining on tip ${parentTip} (height ${nextHeight}), ` +
        `${mempoolTxIds.length} tx(s), ${PARALLEL} workers…`
    );

    // Spawn workers to brute-force the nonce
    let winningNonce: string | null = null;
    const workers: Worker[] = [];

    const MAX_NONCE = BigInt("0x" + "f".repeat(64));
    const CHUNK = MAX_NONCE / BigInt(PARALLEL);

    for (let i = 0; i < PARALLEL; i++) {
      const startNonce = CHUNK * BigInt(i);
      const endNonce =
        i === PARALLEL - 1 ? MAX_NONCE : CHUNK * BigInt(i + 1) - BigInt(1);

      const w = new Worker(path.resolve(__dirname, "mineWorker.ts"));
      w.postMessage({
        prefix,
        suffix,
        startNonce: startNonce.toString(),
        endNonce: endNonce.toString(),
        target: REQUIRED_TARGET,
      });

      w.on("message", (m: any) => {
        if (m.type === "found" && !winningNonce) {
          winningNonce = m.nonce;
          workers.forEach((wk) => wk.terminate());
        }
      });

      workers.push(w);
    }

    // Wait either for a nonce or for the chain tip to move
    while (!winningNonce) {
      const latestTip = globalDatabase.getChainTip();
      if (latestTip !== parentTip) {
        // Someone else mined a block first -> abort this round
        workers.forEach((wk) => wk.terminate());
        logger.info(
          `⚠️ New tip ${latestTip} detected—abandoning work on ${parentTip}`
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!winningNonce) {
      continue; // Retry on the new tip
    }

    // We won the race ! Finalize our block
    const finalBlock = { ...templateNoNonce, nonce: winningNonce! };
    const blockId = computeObjectId(finalBlock);
    logger.info(`✅ Mined block ${blockId} on top of ${parentTip}`);

    // Validate & commit
    globalDatabase.addObject(coinbaseTx);
    const invalid = await BlockValidator.validateBlock(
      finalBlock,
      globalUTXO.clone()
    );
    if (invalid) {
      logger.error(`❌ Rejecting own block: ${invalid}`);
      globalDatabase.deleteObject(coinbaseTx);
      continue;
    }

    // Commit block and update chain state
    globalDatabase.addObject(finalBlock);
    globalDatabase.setChainTip(blockId);
    blockHeights.set(blockId, nextHeight);

    // Update UTXO set with all txs in this block
    const txObjects = txids.map((id) => globalDatabase.getObject(id)!);
    globalUTXO.updateWithTransactions(txObjects);
    globalUTXO.saveToFile();

    // Gossip + mempool cleanup + outgoing payment
    network.broadcast({ type: "ihaveobject", objectid: coinbaseId });
    network.broadcast({ type: "ihaveobject", objectid: blockId });

    updateMempoolOnBlock(finalBlock);
    logger.info(`🗑️  Mempool now contains ${mempoolTxIds.length} tx(s)`);

    // await scanAndSend(PUBLIC_KEY_DEST, COINBASE_REWARD);

    // Brief pause before the next round
    await new Promise((r) => setTimeout(r, 300));
  }
}
