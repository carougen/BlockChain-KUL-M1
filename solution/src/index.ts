import { network } from "./network";
import { initMempoolFromChain } from "./mempool";
import { startMiner } from "./miner";
import { globalDatabase } from "./database";
import { GENESIS_BLOCK_ID } from "./block";
import { logger } from "./logger";
import { blockHeights } from "./block";

const BIND_PORT = 18018;
const BIND_IP = "0.0.0.0";

async function main() {
  network.init(BIND_PORT, BIND_IP);

  // Check that our objects.json actually contains the genesis block
  const all = globalDatabase.getAllObjects();
  if (!(GENESIS_BLOCK_ID in all)) {
    logger.error(
      `❌ Genesis block ${GENESIS_BLOCK_ID} not found in objects.json!`
    );
    process.exit(1);
  }

  // If we have no tip yet, point it at genesis
  if (!globalDatabase.getChainTip()) {
    logger.info(`ℹ️ Setting chain tip to genesis: ${GENESIS_BLOCK_ID}`);
    globalDatabase.setChainTip(GENESIS_BLOCK_ID);
    blockHeights.set(GENESIS_BLOCK_ID, 0);
  } else {
    logger.info(`ℹ️ Resuming from tip: ${globalDatabase.getChainTip()}`);
  }

  // Seed our mempool UTXO snapshot
  initMempoolFromChain();

  // Begin mining loop (never returns)
  await startMiner();
}

main();
