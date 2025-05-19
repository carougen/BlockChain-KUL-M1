import { globalDatabase } from "./database";
import { logger } from "./logger";
import crypto from "crypto";
import { canonicalize } from "json-canonicalize";

export class TransactionValidator {
  static validateTransaction(tx: any): string | null {
    // Coinbase transaction: should not have inputs and must have a height key.
    if ("height" in tx) {
      if ("inputs" in tx && Array.isArray(tx.inputs) && tx.inputs.length > 0) {
        logger.error(
          `❌ [TransactionValidator] Coinbase transaction should not have inputs.`
        );
        return "INVALID_FORMAT";
      }
      if (typeof tx.height !== "number" || tx.height < 0) {
        logger.error(
          `❌ [TransactionValidator] Invalid coinbase height value: ${tx.height}`
        );
        return "INVALID_FORMAT";
      }
      logger.info(
        `✅ [TransactionValidator] Coinbase transaction validated successfully.`
      );
      return null;
    }

    // Normal transactions:
    if (
      !tx ||
      typeof tx !== "object" ||
      !("inputs" in tx) ||
      !("outputs" in tx)
    ) {
      logger.error(
        `❌ [TransactionValidator] Transaction missing required properties.`
      );
      return "INVALID_FORMAT";
    }
    if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) {
      logger.error(
        `❌ [TransactionValidator] Transaction inputs are missing or empty.`
      );
      return "INVALID_FORMAT";
    }
    if (!Array.isArray(tx.outputs)) {
      logger.error(
        `❌ [TransactionValidator] Transaction outputs must be an array.`
      );
      return "INVALID_FORMAT";
    }

    const seenOutpoints = new Set<string>();
    let totalInputValue = 0;
    let totalOutputValue = 0;

    // Phase 1: Validate outpoints and calculate totals.
    for (const input of tx.inputs) {
      if (
        !input.outpoint ||
        !input.outpoint.txid ||
        input.outpoint.index === undefined ||
        input.outpoint.index < 0
      ) {
        logger.error(
          `❌ [TransactionValidator] Invalid input outpoint format.`
        );
        return "INVALID_FORMAT";
      }
      const referencedTx = globalDatabase.getObject(input.outpoint.txid);
      if (!referencedTx) {
        logger.error(
          `❌ [TransactionValidator] Referenced transaction not found: ${input.outpoint.txid}`
        );
        return "UNKNOWN_OBJECT";
      }
      if (
        !referencedTx.outputs ||
        input.outpoint.index >= referencedTx.outputs.length
      ) {
        logger.error(
          `❌ [TransactionValidator] Invalid outpoint index ${input.outpoint.index} for transaction ${input.outpoint.txid}`
        );
        return "INVALID_TX_OUTPOINT";
      }
      const outpointKey = `${input.outpoint.txid}:${input.outpoint.index}`;
      if (seenOutpoints.has(outpointKey)) {
        logger.error(
          `❌ [TransactionValidator] Duplicate outpoint detected: ${outpointKey}`
        );
        return "INVALID_TX_OUTPOINT";
      }
      seenOutpoints.add(outpointKey);
      totalInputValue += referencedTx.outputs[input.outpoint.index].value;
    }

    for (const output of tx.outputs) {
      if (
        !output.pubkey ||
        typeof output.value !== "number" ||
        output.value < 0
      ) {
        logger.error(
          `❌ [TransactionValidator] Invalid output detected: ${JSON.stringify(
            output
          )}`
        );
        return "INVALID_FORMAT";
      }
      totalOutputValue += output.value;
    }

    if (totalInputValue < totalOutputValue) {
      logger.error(
        `❌ [TransactionValidator] Transaction does not satisfy conservation: totalInput ${totalInputValue} < totalOutput ${totalOutputValue}`
      );
      return "INVALID_TX_CONSERVATION";
    }

    // Phase 2: Signature verification.
    const txForVerification = JSON.parse(JSON.stringify(tx));
    // Replace all signatures with null as required.
    for (let input of txForVerification.inputs) {
      input.sig = null;
    }
    const messageToSign = canonicalize(txForVerification);
    if (messageToSign === undefined) {
      logger.error(
        `❌ [TransactionValidator] Unable to canonicalize transaction for verification.`
      );
      return "INVALID_FORMAT";
    }
    const messageBuffer = Buffer.from(messageToSign, "utf8");

    for (const input of tx.inputs) {
      if (!input.sig) {
        logger.error(`❌ [TransactionValidator] Missing signature for input.`);
        return "INVALID_TX_SIGNATURE";
      }
      const referencedTx = globalDatabase.getObject(input.outpoint.txid);
      if (!referencedTx) {
        logger.error(
          `❌ [TransactionValidator] Referenced transaction not found during signature verification: ${input.outpoint.txid}`
        );
        return "UNKNOWN_OBJECT";
      }
      const pubkey = referencedTx.outputs[input.outpoint.index].pubkey;
      try {
        // Convert the hex-encoded public key to a Buffer.
        const publicKeyBuffer = Buffer.from(pubkey, "hex");
        // Build the JWK for Ed25519.
        const jwk = {
          kty: "OKP",
          crv: "Ed25519",
          x: publicKeyBuffer.toString("base64url"),
        };
        // Create the public key object from the JWK.
        const publicKeyObject = crypto.createPublicKey({
          key: jwk,
          format: "jwk",
        });
        // Convert the signature from hex to a Buffer.
        const signatureBuffer = Buffer.from(input.sig, "hex");
        const isValid = crypto.verify(
          null,
          messageBuffer,
          publicKeyObject,
          signatureBuffer
        );
        if (!isValid) {
          logger.error(
            `❌ [TransactionValidator] Signature verification failed for outpoint ${input.outpoint.txid}:${input.outpoint.index}`
          );
          return "INVALID_TX_SIGNATURE";
        }
      } catch (e) {
        logger.error(
          `❌ [TransactionValidator] Signature verification error: ${e}`
        );
        return "INVALID_TX_SIGNATURE";
      }
    }

    logger.info(
      `✅ [TransactionValidator] Transaction validated successfully.`
    );
    return null;
  }
}
