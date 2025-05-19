import { UTXOSet, globalUTXO } from "./utxo";
import { computeObjectId, globalDatabase } from "./database";
import { TransactionValidator } from "./transaction";
import { EventEmitter } from "events";

export const mempoolEvents = new EventEmitter();

// In‐flight mempool transaction IDs, in arrival order
export const mempoolTxIds: string[] = [];

// UTXO snapshot reflecting all mempool transactions
export let mempoolUTXO: UTXOSet;

// Initialize the mempool state from the chain tip's UTXO.
// Must be called once after your node finishes initial sync.
export function initMempoolFromChain(): void {
  mempoolUTXO = globalUTXO.clone(); // clone tip UTXO
  mempoolTxIds.length = 0;
}

// Try to add a transaction to the mempool.
export function tryAddToMempool(txId: string): string | null {
  // Retrieve the transaction object
  const tx = globalDatabase.getObject(txId);
  if (tx === null) {
    return "UNKNOWN_OBJECT";
  }

  // Ensure it's a transaction
  if (tx.type !== "transaction") {
    return "INVALID_FORMAT";
  }

  // Ignore coinbases (type "transaction" with height field)
  if ("height" in tx && (!tx.inputs || tx.inputs.length === 0)) {
    return "IGNORED_COINBASE";
  }

  // Validate syntax & signatures
  const tvError = TransactionValidator.validateTransaction(tx);
  if (tvError) {
    return tvError;
  }

  // Ensure inputs unspent in mempoolUTXO
  for (const input of tx.inputs) {
    const outpoint = `${input.outpoint.txid}:${input.outpoint.index}`;
    if (!mempoolUTXO.has(outpoint)) {
      return "INVALID_TX_OUTPOINT";
    }
  }

  // Spend inputs then add outputs
  for (const input of tx.inputs) {
    mempoolUTXO.remove(`${input.outpoint.txid}:${input.outpoint.index}`);
  }
  tx.outputs.forEach((output: any, idx: number) => {
    mempoolUTXO.add(`${txId}:${idx}`, {
      value: output.value,
      pubkey: output.pubkey,
    });
  });

  // Record arrival order
  mempoolTxIds.push(txId);
  mempoolEvents.emit("txAdded", txId);
  return null;
}

// Update the mempool when a new block is accepted:
export function updateMempoolOnBlock(block: { txids: string[] }): void {
  // Build a set of transaction IDs confirmed in this block
  const confirmedIds = new Set(block.txids);

  // Remove confirmed transactions from our mempool list
  const survivors: string[] = [];
  for (const id of mempoolTxIds) {
    if (!confirmedIds.has(id)) {
      survivors.push(id);
    } else {
      // Optionally notify listeners that this tx was removed
      mempoolEvents.emit("txRemoved", id);
    }
  }
  // Replace the mempool list with only the surviving tx IDs
  mempoolTxIds.length = 0;
  mempoolTxIds.push(...survivors);

  // Rebuild the UTXO snapshot from the updated chain tip
  mempoolUTXO = globalUTXO.clone();

  // Replay the remaining transactions to update the snapshot
  for (const id of survivors) {
    tryAddToMempool(id);
  }
}

export function updateMempoolOnReorg(
  oldForkTxs: any[],
  oldMempoolTxs: any[]
): void {
  //Reset mempool UTXO snapshot to current chain tip
  initMempoolFromChain();

  // Helper to (re)insert a transaction into the mempool
  //    tryAddToMempool will handle all validation and conflict checks
  const replayTx = (tx: any) => {
    const txId = computeObjectId(tx);
    tryAddToMempool(txId);
  };

  // Re-add every tx that was confirmed in the abandoned fork
  for (const tx of oldForkTxs) {
    replayTx(tx);
  }

  // Re-add the transactions that were already in our mempool
  for (const tx of oldMempoolTxs) {
    replayTx(tx);
  }
}
