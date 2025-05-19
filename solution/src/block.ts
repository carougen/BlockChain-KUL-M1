import { clearInterval } from "timers";
import { globalDatabase, computeObjectId } from "./database";
import { logger } from "./logger";
import { network } from "./network";
import { TransactionValidator } from "./transaction";
import { objectWaiter } from "./objectWaiter";
import { UTXOSet } from "./utxo";

export const REQUIRED_TARGET =
  "0000000abc000000000000000000000000000000000000000000000000000000";
const TX_TIMEOUT = 5000;
const BLOCK_REWARD = 50 * Math.pow(10, 12);
export const pendingBlockTxIds = new Set<string>();
export const blockHeights: Map<string, number> = new Map();
const validatedBlocks = new Set<string>();
export const GENESIS_BLOCK_ID =
  "00000003aa05a8b3ec33a789d2a28a8ece1b33141eb23b4d4b5715685d7a8471";

export class BlockValidator {
  private static isASCIIPrintable(str: string): boolean {
    return /^[\x20-\x7E]{0,128}$/.test(str);
  }

  private static waitForTransaction(txid: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const interval = 500;
      let elapsed = 0;
      const timer = setInterval(() => {
        const obj = globalDatabase.getObject(txid);
        if (obj) {
          if (computeObjectId(obj) === txid) {
            const validationError =
              TransactionValidator.validateTransaction(obj);
            if (validationError === null) {
              pendingBlockTxIds.delete(txid);
              clearInterval(timer);
              resolve();
              return;
            } else {
              logger.debug(
                `🔍 [SubBlockValidator] Retrieved transaction ${txid} invalid: ${validationError}. Continuing to wait.`
              );
            }
          }
        }
        elapsed += interval;
        if (elapsed >= TX_TIMEOUT) {
          clearInterval(timer);
          reject(new Error("Timeout"));
        }
      }, interval);
    });
  }

  static async validate(block: any): Promise<string | null> {
    // Required fields
    const requiredFields = ["T", "created", "nonce", "txids", "previd"];
    for (const field of requiredFields) {
      if (!(field in block)) {
        logger.error(`❌ [SubBlockValidator] Missing required field: ${field}`);
        return "INVALID_FORMAT";
      }
    }

    // Validate T and nonce as 64-character hexadecimal strings
    const hexRegex = /^[0-9a-f]{64}$/;
    if (!hexRegex.test(block.T)) {
      logger.error(`❌ [SubBlockValidator] Invalid format for T: ${block.T}`);
      return "INVALID_FORMAT";
    }
    if (!hexRegex.test(block.nonce)) {
      logger.error(
        `❌ [SubBlockValidator] Invalid format for nonce: ${block.nonce}`
      );
      return "INVALID_FORMAT";
    }

    // Validate T: must be the targer required.
    if (block.T !== REQUIRED_TARGET) {
      logger.error(
        `❌ [SubBlockValidator] Invalid target T: expected ${REQUIRED_TARGET}, got ${block.T}`
      );
      return "INVALID_FORMAT";
    }

    // Validate previd: must be 64-character hex if not null.
    if (block.previd !== null && !hexRegex.test(block.previd)) {
      logger.error(
        `❌ [SubBlockValidator] Invalid format for previd: ${block.previd}`
      );
      return "INVALID_FORMAT";
    }

    // Validate created: must be a non-negative integer.
    if (
      typeof block.created !== "number" ||
      !Number.isInteger(block.created) ||
      block.created < 0
    ) {
      logger.error(
        `❌ [SubBlockValidator] Invalid created field: ${block.created}`
      );
      return "INVALID_FORMAT";
    }

    // Validate txids: must be an array of strings.
    if (!Array.isArray(block.txids)) {
      logger.error(`❌ [SubBlockValidator] txids is not an array.`);
      return "INVALID_FORMAT";
    }
    for (const txid of block.txids) {
      if (typeof txid !== "string" || !hexRegex.test(txid)) {
        logger.error(`❌ [SubBlockValidator] Invalid txid in txids: ${txid}`);
        return "INVALID_FORMAT";
      }
    }

    // Validate optional fields: miner and note must be ASCII-printable and ≤ 128 characters.
    if (block.miner) {
      if (
        typeof block.miner !== "string" ||
        !this.isASCIIPrintable(block.miner)
      ) {
        logger.error(
          `❌ [SubBlockValidator] Invalid miner field: ${block.miner}`
        );
        return "INVALID_FORMAT";
      }
    }
    if (block.note) {
      if (
        typeof block.note !== "string" ||
        !this.isASCIIPrintable(block.note)
      ) {
        logger.error(
          `❌ [SubBlockValidator] Invalid note field: ${block.note}`
        );
        return "INVALID_FORMAT";
      }
    }

    // Validate studentids: must be an array of at most 10 ASCII-printable strings
    if (block.studentids) {
      if (!Array.isArray(block.studentids) || block.studentids.length > 10) {
        logger.error(`❌ [SubBlockValidator] Invalid studentids field.`);
        return "INVALID_FORMAT";
      }
      for (const sid of block.studentids) {
        if (typeof sid !== "string" || !this.isASCIIPrintable(sid)) {
          logger.error(`❌ [SubBlockValidator] Invalid studentid: ${sid}`);
          return "INVALID_FORMAT";
        }
      }
    }

    // Validate proof-of-work: computed blockID must be strictly less than T.
    const blockID = computeObjectId(block);
    logger.debug(
      `🔍 [SubBlockValidator] Computed blockID: ${blockID} vs target T: ${block.T}`
    );
    if (!(blockID < block.T)) {
      logger.error(
        `❌ [SubBlockValidator] Invalid proof-of-work: blockID ${blockID} is not less than T ${block.T}`
      );
      return "INVALID_BLOCK_POW";
    }

    // Check for missing transactions if there is.
    const missingTxPromises = block.txids.map((txid: string) => {
      if (!globalDatabase.getObject(txid)) {
        pendingBlockTxIds.add(txid);
        logger.info(
          `🔍 [SubBlockValidator] Transaction ${txid} not found locally, sending getobject request.`
        );
        network.broadcast({ type: "getobject", objectid: txid });
        return this.waitForTransaction(txid);
      }
      return Promise.resolve();
    });

    try {
      await Promise.all(missingTxPromises);
    } catch (error) {
      logger.error(
        "❌ [SubBlockValidator] One or more transaction were not found within the time limit."
      );
      return "UNFINDABLE_OBJECT";
    }

    // Everything is fine, we can return null to pursue in the validateBlock function.
    logger.info(
      `✅ [SubBlockValidator] Block if for now validated successfully.`
    );
    return null;
  }

  static async awaitParentBlock(
    block: any,
    utxoSet: UTXOSet
  ): Promise<string | null> {
    const parentId = block.previd;
    if (!parentId) {
      // No parent (this is likely the genesis block), nothing to do.
      const blockId = computeObjectId(block);
      if (blockId !== GENESIS_BLOCK_ID) {
        logger.error(
          `❌ [BlockValidator] Block with null parent is not the real genesis block. Computed: ${blockId}`
        );
        return "INVALID_GENESIS";
      }
      return null;
    }

    let parent = await globalDatabase.getObject(parentId);
    if (!parent) {
      // if parent block not found in database, request from peers
      network.broadcast({
        type: "getobject",
        objectid: parentId,
      });

      try {
        parent = await objectWaiter.waitFor(parentId, TX_TIMEOUT); // 10-second timeout
      } catch (err) {
        logger.error(
          `❌ [BlockValidator] requested parent block was not received`
        );
        return "UNFINDABLE_OBJECT";
      }
    }

    const parentBlockId = computeObjectId(parent);
    if (validatedBlocks.has(parentBlockId)) {
      logger.debug(
        `🔄 [BlockValidator] Parent block ${parentBlockId} already validated, skipping.`
      );
      return null;
    }

    // Recursively validate the parent
    const parentValidationError = await BlockValidator.validateBlock(
      parent,
      utxoSet
    );
    if (parentValidationError !== null) {
      logger.error(
        `❌ [BlockValidator] Parent block ${parentId} is invalid: ${parentValidationError}`
      );
      return parentValidationError;
    }

    validatedBlocks.add(parentBlockId);
    return null;
  }

  static async validateBlock(
    block: any,
    utxoSet: UTXOSet
  ): Promise<string | null> {
    const validationError = await BlockValidator.validate(block);
    if (validationError !== null) {
      return validationError;
    } 

    // Validate block's parents
    const parentBlockError = await BlockValidator.awaitParentBlock(
      block,
      utxoSet
    );
    if (parentBlockError !== null) {
      return parentBlockError;
    }

    let coinbaseFound = false;
    let totalFees = 0;
    const spentOutpoints = new Set<string>(); // For detecting double spending in the block.
    const transactions: any[] = [];
    let height = 0;

    // Compute and set block height
    if (block.previd) {
      const parent = await globalDatabase.getObject(block.previd);
      const parentId = computeObjectId(parent);
      const parentHeight = blockHeights.get(parentId);

      if (parentHeight === undefined) {
        logger.error(
          `❌ [MainBlockValidator] Parent block ${parentId} has no known height.`
        );
        return "UNFINDABLE_OBJECT";
      }

      height = parentHeight + 1;
    }

    const blockId = computeObjectId(block);
    blockHeights.set(blockId, height);

    //Validate timestamp
    if (block.previd) {
      const parent = await globalDatabase.getObject(block.previd);
      if (parent && parent.created !== undefined) {
        if (block.created <= parent.created) {
          logger.error(
            `❌ [MainBlockValidator] Block timestamp ${block.created} is not greater than parent's ${parent.created}.`
          );
          return "INVALID_BLOCK_TIMESTAMP";
        }
      }
    }

    const now = Math.floor(Date.now() / 1000);
    if (block.created >= now + 2) {
      logger.error(
        `❌ [MainBlockValidator] Block timestamp ${block.created} is in the future.`
      );
      return "INVALID_BLOCK_TIMESTAMP";
    }

    // Validate each transaction and build a transactions array.
    for (let i = 0; i < block.txids.length; i++) {
      const txid = block.txids[i];
      const tx = globalDatabase.getObject(txid);
      if (!tx) {
        logger.error(
          `❌ [MainBlockValidator] Transaction ${txid} missing during processing.`
        );
        return "UNFINDABLE_OBJECT";
      }

      // Validate the transaction.
      const txValidationError = TransactionValidator.validateTransaction(tx);
      if (txValidationError !== null) {
        logger.error(
          `❌ [MainBlockValidator] Transaction ${txid} is invalid: ${txValidationError}`
        );
        return "UNFINDABLE_OBJECT";
      }

      if ("height" in tx) {
        // Coinbase transaction: must be at index 0 and unique.
        if (i !== 0) {
          logger.error(
            `❌ [MainBlockValidator] Coinbase transaction is not at index 0.`
          );
          return "INVALID_BLOCK_COINBASE";
        }
        if (coinbaseFound) {
          logger.error(
            `❌ [MainBlockValidator] Multiple coinbase transactions found.`
          );
          return "INVALID_BLOCK_COINBASE";
        }

        if (tx.height !== height) {
          logger.error(
            `❌ [MainBlockValidator] Coinbase transaction height ${tx.height} does not match block height ${height}.`
          );
          return "INVALID_BLOCK_COINBASE";
        }

        if (tx.inputs && tx.inputs.length > 0) {
          logger.error(
            `❌ [MainBlockValidator] Coinbase transaction should not have inputs.`
          );
          return "INVALID_FORMAT";
        }
        if (!Array.isArray(tx.outputs) || tx.outputs.length !== 1) {
          logger.error(
            `❌ [MainBlockValidator] Coinbase transaction must have exactly one output.`
          );
          return "INVALID_BLOCK_COINBASE";
        }

        coinbaseFound = true;
      } else {
        // Normal transaction: validate inputs.
        if (!Array.isArray(tx.inputs)) {
          logger.error(
            `❌ [MainBlockValidator] Transaction ${txid} missing inputs.`
          );
          return "INVALID_FORMAT";
        }

        let inputSum = 0;

        for (const input of tx.inputs) {
          const outpoint = `${input.outpoint.txid}:${input.outpoint.index}`;
          if (spentOutpoints.has(outpoint)) {
            logger.error(
              `❌ [MainBlockValidator] Double spending detected on outpoint: ${outpoint}`
            );
            return "INVALID_TX_OUTPOINT";
          }
          spentOutpoints.add(outpoint);
          if (!utxoSet.has(outpoint)) {
            logger.error(
              `❌ [MainBlockValidator] Transaction ${txid} is spending non-existent UTXO: ${outpoint}`
            );
            return "INVALID_TX_OUTPOINT";
          }
          const utxo = utxoSet.get(outpoint);
          if (utxo) {
            inputSum += utxo.value;
          }
        }
        let outputSum = 0;
        if (!Array.isArray(tx.outputs)) {
          logger.error(
            `❌ [MainBlockValidator] Transaction ${txid} missing outputs.`
          );
          return "INVALID_FORMAT";
        }
        for (const output of tx.outputs) {
          outputSum += output.value;
        }
        if (inputSum < outputSum) {
          logger.error(
            `❌ [MainBlockValidator] Transaction ${txid} does not satisfy conservation: input sum ${inputSum} < output sum ${outputSum}`
          );
          return "INVALID_TX_CONSERVATION";
        }
        totalFees += inputSum - outputSum;
      }
      transactions.push(tx);
    }

    // If a coinbase transaction exists, verify its output does not exceed block reward + fees.
    if (coinbaseFound) {
      const coinbaseTx = globalDatabase.getObject(block.txids[0]);
      const coinbaseOutput = coinbaseTx.outputs[0].value;
      if (coinbaseOutput > BLOCK_REWARD + totalFees) {
        logger.error(
          `❌ [MainBlockValidator] Coinbase output (${coinbaseOutput}) exceeds block reward + fees (${
            BLOCK_REWARD + totalFees
          }).`
        );
        return "INVALID_BLOCK_COINBASE";
      }
    }

    // Update the UTXO set using the updateWithTransactions method.
    const updateSuccess = utxoSet.updateWithTransactions(transactions);
    if (!updateSuccess) {
      logger.error(`❌ [MainBlockValidator] UTXO update failed.`);
      return "INVALID_TX_OUTPOINT";
    }

    // Save the updated UTXO set.
    utxoSet.saveToFile();
    logger.info(
      `✅ [MainBlockValidator] Block validated and UTXO set updated successfully.`
    );
    validatedBlocks.add(blockId);
    return null;
  }

  //Fetch a block by ID, waiting for it if necessary.
  public static async fetchBlock(blockId: string): Promise<any> {
    // 1) If we already have it, return immediately
    let blk = globalDatabase.getObject(blockId);
    if (blk) return blk;

    // 2) Otherwise, broadcast a getobject request
    logger.info(
      `🔍 [BlockValidator] Missing block ${blockId}, requesting from peers.`
    );
    network.broadcast({ type: "getobject", objectid: blockId });

    // 3) Wait up to 10s for it to arrive via objectWaiter
    try {
      blk = await objectWaiter.waitFor(blockId, TX_TIMEOUT);
      return blk;
    } catch {
      logger.error(`❌ [BlockValidator] Timeout waiting for block ${blockId}`);
      throw new Error("UNFINDABLE_OBJECT");
    }
  }
}
