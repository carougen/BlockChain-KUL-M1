import fs from "fs";
import { logger } from "./logger";
import { TransactionValidator } from "./transaction";
import { computeObjectId } from "./database";

const UTXO_FILE = "data/utxo.json";

export interface UTXO {
  value: number;
  pubkey: string;
}

export class UTXOSet {
  private utxoMap: Map<string, UTXO>;

  // Initializes the UTXO set.
  constructor(initialUTXO?: Map<string, UTXO>) {
    this.utxoMap = initialUTXO ? new Map(initialUTXO) : new Map();
  }

  // Checks if the UTXO set contains the given outpoint.
  public has(outpoint: string): boolean {
    return this.utxoMap.has(outpoint);
  }

  // Retrieves the UTXO associated with the given outpoint.
  public get(outpoint: string): UTXO | undefined {
    return this.utxoMap.get(outpoint);
  }

  // Adds a new UTXO to the set.
  public add(outpoint: string, utxo: UTXO): void {
    this.utxoMap.set(outpoint, utxo);
  }

  // Saves the UTXO set to a JSON file.
  public saveToFile(): void {
    const obj: Record<string, UTXO> = {};
    for (const [key, value] of this.utxoMap.entries()) {
      obj[key] = value;
    }
    try {
      fs.writeFileSync(UTXO_FILE, JSON.stringify(obj, null, 2));
      logger.info(`✅ [UTXO] UTXO set saved to ${UTXO_FILE}`);
    } catch (error) {
      logger.error(
        `❌ [UTXO] Error storing UXTOs: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Loads the UTXO set from a JSON file.
  public static loadFromFile(): UTXOSet {
    if (!fs.existsSync(UTXO_FILE)) {
      logger.warn(
        `❗UTXO file not found at ${UTXO_FILE}, starting with empty UTXO set`
      );
      return new UTXOSet();
    }

    const filedata = fs.readFileSync(UTXO_FILE, "utf-8");
    if (filedata.length == 0) {
      return new UTXOSet();
    }
    const obj = JSON.parse(filedata) as Record<string, UTXO>;
    const map = new Map<string, UTXO>();
    for (const key in obj) {
      map.set(key, obj[key]);
    }

    logger.info(`📝 UTXO set loaded from ${UTXO_FILE}`);
    return new UTXOSet(map);
  }

  // Updates the UTXO set based on an array of transactions.
  // For each transaction:
  //  - For a normal transaction: remove UTXOs referenced in its inputs and add its outputs.
  //  - For a coinbase transaction: add its output (ensuring it has no inputs and exactly one output).
  // Also detects double spending within the block.
  public updateWithTransactions(transactions: any[]): boolean {
    const seenInputs = new Set<string>(); // Track inputs used within this block

    for (const tx of transactions) {
      const txid = computeObjectId(tx);

      // Full transaction-level validation
      const validationResult = TransactionValidator.validateTransaction(tx);
      if (validationResult !== null) {
        logger.warn(
          `❌ [UTXOSet] Transaction ${txid} failed validation: ${validationResult}`
        );
        return false; // Abort block if any transaction is invalid
      }

      // Handle coinbase transaction
      if (!tx.inputs || tx.inputs.length === 0) {
        if (!tx.outputs || tx.outputs.length !== 1) {
          logger.warn(
            `❌ [UTXOSet] Invalid coinbase transaction: ${txid} must have exactly one output.`
          );
          return false;
        } //  it has no inputs and exactly one output

        // Create UTXO for coinbase output at index 0
        const outpoint = `${txid}:0`;
        this.add(outpoint, {
          value: tx.outputs[0].value,
          pubkey: tx.outputs[0].pubkey,
        });

        continue;
      }

      // Handle normal transaction
      for (const input of tx.inputs) {
        const inpoint = `${input.outpoint.txid}:${input.outpoint.index}`;

        // Check for double-spending within this block
        if (seenInputs.has(inpoint)) {
          logger.warn(
            `❌ [UTXO] Double-spending detected in block at input ${inpoint}`
          );
          return false;
        }

        // Check if input UTXO exists in current set
        if (!this.has(inpoint)) {
          logger.warn(
            `❌ [UTXO] Referenced input ${inpoint} not found in UTXO set`
          );
          return false;
        }

        // Mark input as used and remove it from UTXO set
        seenInputs.add(inpoint);
        this.utxoMap.delete(inpoint);
      }

      // Add outputs to the UTXO set
      tx.outputs?.forEach((output: any, index: number) => {
        const outpoint = `${txid}:${index}`;
        this.add(outpoint, {
          value: output.value,
          pubkey: output.pubkey,
        });
      });
    }

    return true;
  }

  // Removes the given outpoint from the UTXO set.
  public remove(outpoint: string): boolean {
    return this.utxoMap.delete(outpoint);
  }

  // Creates a shallow clone of this UTXOSet.
  public clone(): UTXOSet {
    return new UTXOSet(this.utxoMap);
  }
}

export const globalUTXO = UTXOSet.loadFromFile();
