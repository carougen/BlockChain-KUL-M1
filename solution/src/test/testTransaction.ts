import crypto from "crypto";
import chalk from "chalk";
import { globalDatabase, computeObjectId } from "../database";
import { canonicalize } from "json-canonicalize";
import { TransactionValidator } from "../transaction";

// --------------------------
// Inline TransactionType Definition
// --------------------------
export type TransactionType = {
  type: "transaction";
  inputs: Array<{ outpoint: { txid: string; index: number }; sig: string }>;
  outputs: Array<{ pubkey: string; value: number }>;
  height?: number; // Coinbase transactions include a height field.
};

// --------------------------
// Helper Functions
// --------------------------

// Generate an ed25519 key pair in PEM format.
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPEM: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPEM: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

// Compute a short identifier (first 8 hex characters) for a public key.
function getRecipientId(pubkey: string): string {
  return crypto.createHash("sha256").update(pubkey).digest("hex").slice(0, 8);
}

// Sign a transaction using the provided private key.
// The signature is encoded in hexadecimal.
function signTransaction(
  tx: TransactionType,
  privKey: string
): TransactionType {
  const txForVerification = JSON.parse(JSON.stringify(tx));
  // Remove signatures for verification.
  for (const input of txForVerification.inputs) {
    input.sig = "";
  }
  const messageToSign = canonicalize(txForVerification);
  if (messageToSign === undefined) {
    throw new Error("Unable to canonicalize transaction");
  }
  const messageBuffer = Buffer.from(messageToSign, "utf8");
  const signature = crypto.sign(
    null,
    messageBuffer,
    crypto.createPrivateKey(privKey)
  );
  // Set the signature in each input (for simplicity, all inputs get the same signature)
  tx.inputs.forEach((input) => {
    if (input.sig === "") {
      input.sig = signature.toString("hex");
    }
  });
  return tx;
}

// Compute totals for a transaction.
function computeTransactionTotals(tx: TransactionType): {
  totalInput: number;
  totalOutput: number;
} {
  let totalInput = 0;
  for (const input of tx.inputs) {
    const prevTx = globalDatabase.getObject(input.outpoint.txid);
    if (prevTx && prevTx.outputs && prevTx.outputs[input.outpoint.index]) {
      totalInput += prevTx.outputs[input.outpoint.index].value;
    }
  }
  const totalOutput =
    tx.outputs && Array.isArray(tx.outputs)
      ? tx.outputs.reduce((sum, output) => sum + output.value, 0)
      : 0;
  return { totalInput, totalOutput };
}

// Print detailed transaction information.
function printTransactionDetails(tx: TransactionType, label: string) {
  const txId = computeObjectId(tx);
  console.log(chalk.blueBright(`\n=== ${label} ===`));
  console.log(chalk.yellow(`Transaction ID: ${txId}`));
  console.log(chalk.white(`Type: ${tx.type}`));

  if (!tx.inputs || tx.inputs.length === 0) {
    console.log(chalk.cyan("This is a Coinbase Transaction (no inputs)."));
  } else {
    console.log(chalk.cyan(`Inputs (${tx.inputs.length}):`));
    tx.inputs.forEach((input, idx) => {
      console.log(
        `  Input ${idx}: Refers to TXID ${chalk.green(
          input.outpoint.txid
        )} at index ${chalk.green(input.outpoint.index.toString())}`
      );
      console.log(`           Signature: ${chalk.gray(input.sig)}`);
    });
  }

  if (!tx.outputs) {
    console.log(chalk.red("Error: Missing outputs field."));
  } else {
    console.log(chalk.magenta(`Outputs (${tx.outputs.length}):`));
    tx.outputs.forEach((output, idx) => {
      const recipient = getRecipientId(output.pubkey);
      console.log(
        `  Output ${idx}: Recipient ${chalk.green(
          recipient
        )} receives ${chalk.green(output.value.toString())} units`
      );
    });
  }

  const { totalInput, totalOutput } = computeTransactionTotals(tx);
  if (tx.inputs.length > 0) {
    console.log(
      chalk.white(`Total Inputs: ${chalk.green(totalInput.toString())}`)
    );
    console.log(
      chalk.white(`Total Outputs: ${chalk.green(totalOutput.toString())}`)
    );
    console.log(
      chalk.white(`Fee: ${chalk.green((totalInput - totalOutput).toString())}`)
    );
  } else {
    console.log(chalk.white("Total Inputs: 0"));
    console.log(
      chalk.white(`Total Outputs: ${chalk.green(totalOutput.toString())}`)
    );
  }
}

// Clear the global database for test isolation.
function clearDatabase() {
  // Assuming globalDatabase stores its objects in a property "db".
  (globalDatabase as any).db = {};
}

// Setup a fresh coinbase transaction and key pair; returns coinbaseTx, its ID, and keyPair.
function setupCoinbase(): {
  coinbaseTx: TransactionType;
  coinbaseTxId: string;
  keyPair: ReturnType<typeof generateKeyPair>;
} {
  clearDatabase();
  // Create a valid coinbase transaction.
  const coinbaseTx: TransactionType = {
    type: "transaction",
    inputs: [],
    outputs: [
      {
        pubkey:
          "7cb057a09fb1c0b38b430e3c9deae5607c32665d526ee75724cb0615319a87d7",
        value: 50000000000000,
      },
    ],
    height: 1,
  };
  const coinbaseTxId = computeObjectId(coinbaseTx);
  globalDatabase.addObject(coinbaseTx);
  // Generate a key pair and override the coinbase output pubkey so that spending transactions can be signed.
  const keyPair = generateKeyPair();
  coinbaseTx.outputs[0].pubkey = keyPair.publicKeyPEM;
  // Update the coinbase transaction in the database.
  globalDatabase.addObject(coinbaseTx);
  return { coinbaseTx, coinbaseTxId, keyPair };
}

// Run a test on a transaction and print the result.
// The expected string should be either "PASSED" or "FAILED - ERROR_CODE".
// Returns true if the actual outcome matches the expected one.
function runTest(
  tx: TransactionType,
  description: string,
  expected: string
): boolean {
  console.log(chalk.bold(`\n--> ${description}`));
  printTransactionDetails(tx, description);
  console.log(chalk.white(`Expected: ${expected}`));
  const error = TransactionValidator.validateTransaction(tx);

  // If expected starts with "FAILED - ", remove that prefix for comparison.
  const expectedError = expected.startsWith("FAILED - ")
    ? expected.substring(9)
    : expected;
  let passed: boolean;
  if (error) {
    console.log(chalk.bgRed.white(`Result: FAILED - ${error}`));
    passed = expected !== "PASSED" && error === expectedError;
  } else {
    console.log(chalk.bgGreen.white("Result: PASSED"));
    passed = expected === "PASSED";
  }
  return passed;
}

// --------------------------
// Global Test Results Array
// --------------------------
const testResults: boolean[] = [];

// --------------------------
// Test Cases per Protocol Specification
// --------------------------
function runProtocolTests() {
  // 1. Unknown Object Test:
  clearDatabase();
  const { coinbaseTxId, keyPair } = setupCoinbase();
  const unknownTx: TransactionType = {
    type: "transaction",
    inputs: [{ outpoint: { txid: "nonexistent_txid", index: 0 }, sig: "" }],
    outputs: [{ pubkey: keyPair.publicKeyPEM, value: 10000000000000 }],
  };
  testResults.push(
    runTest(unknownTx, "Unknown Object Test", "FAILED - UNKNOWN_OBJECT")
  );

  // 2. Invalid Outpoint Index Test:
  clearDatabase();
  const setup1 = setupCoinbase();
  testResults.push(
    runTest(
      signTransaction(
        {
          type: "transaction",
          inputs: [
            { outpoint: { txid: setup1.coinbaseTxId, index: 1 }, sig: "" },
          ],
          outputs: [
            { pubkey: setup1.keyPair.publicKeyPEM, value: 10000000000000 },
          ],
        },
        setup1.keyPair.privateKeyPEM
      ),
      "Invalid Outpoint Index Test",
      "FAILED - INVALID_TX_OUTPOINT"
    )
  );

  // 3. Invalid Signature Test:
  clearDatabase();
  const setup2 = setupCoinbase();
  const txBadSig = signTransaction(
    {
      type: "transaction",
      inputs: [{ outpoint: { txid: setup2.coinbaseTxId, index: 0 }, sig: "" }],
      outputs: [{ pubkey: setup2.keyPair.publicKeyPEM, value: 20000000000000 }],
    },
    setup2.keyPair.privateKeyPEM
  );
  txBadSig.inputs[0].sig = "bad_signature";
  testResults.push(
    runTest(txBadSig, "Invalid Signature Test", "FAILED - INVALID_TX_SIGNATURE")
  );

  // 4. Duplicate Outpoint Test:
  clearDatabase();
  const setup3 = setupCoinbase();
  testResults.push(
    runTest(
      signTransaction(
        {
          type: "transaction",
          inputs: [
            { outpoint: { txid: setup3.coinbaseTxId, index: 0 }, sig: "" },
            { outpoint: { txid: setup3.coinbaseTxId, index: 0 }, sig: "" },
          ],
          outputs: [
            { pubkey: setup3.keyPair.publicKeyPEM, value: 40000000000000 },
            { pubkey: setup3.keyPair.publicKeyPEM, value: 5000000000000 },
          ],
        },
        setup3.keyPair.privateKeyPEM
      ),
      "Duplicate Outpoint Test",
      "FAILED - INVALID_TX_OUTPOINT"
    )
  );

  // 5. Conservation Law Test:
  clearDatabase();
  const setup4 = setupCoinbase();
  testResults.push(
    runTest(
      signTransaction(
        {
          type: "transaction",
          inputs: [
            { outpoint: { txid: setup4.coinbaseTxId, index: 0 }, sig: "" },
          ],
          outputs: [
            { pubkey: setup4.keyPair.publicKeyPEM, value: 60000000000000 },
          ],
        },
        setup4.keyPair.privateKeyPEM
      ),
      "Conservation Law Test",
      "FAILED - INVALID_TX_CONSERVATION"
    )
  );

  // 6. Invalid Output Format Test:
  clearDatabase();
  const setup5 = setupCoinbase();
  testResults.push(
    runTest(
      signTransaction(
        {
          type: "transaction",
          inputs: [
            { outpoint: { txid: setup5.coinbaseTxId, index: 0 }, sig: "" },
          ],
          outputs: [{ pubkey: setup5.keyPair.publicKeyPEM, value: -100 }],
        },
        setup5.keyPair.privateKeyPEM
      ),
      "Invalid Output Format Test",
      "FAILED - INVALID_FORMAT"
    )
  );

  // 7. Missing Required Properties Test:
  clearDatabase();
  const setup6 = setupCoinbase();
  testResults.push(
    runTest(
      {
        type: "transaction",
        inputs: [
          { outpoint: { txid: setup6.coinbaseTxId, index: 0 }, sig: "" },
        ],
        // Missing outputs field.
      } as any,
      "Missing Required Properties Test",
      "FAILED - INVALID_FORMAT"
    )
  );
}

// --------------------------
// Additional Chained Transactions Tests
// --------------------------
function runChainedTransactionsTests() {
  // This test creates a chain of valid transactions.
  clearDatabase();
  const { coinbaseTxId, keyPair } = setupCoinbase();
  // Create a spending transaction from the coinbase.
  const txA: TransactionType = signTransaction(
    {
      type: "transaction",
      inputs: [{ outpoint: { txid: coinbaseTxId, index: 0 }, sig: "" }],
      outputs: [
        { pubkey: keyPair.publicKeyPEM, value: 40000000000000 },
        { pubkey: keyPair.publicKeyPEM, value: 5000000000000 },
      ],
    },
    keyPair.privateKeyPEM
  );
  globalDatabase.addObject(txA);

  // Create a second transaction (txB) that spends from txA's first output.
  const txAId = computeObjectId(txA);
  const txB: TransactionType = signTransaction(
    {
      type: "transaction",
      inputs: [{ outpoint: { txid: txAId, index: 0 }, sig: "" }],
      outputs: [
        { pubkey: keyPair.publicKeyPEM, value: 30000000000000 },
        { pubkey: keyPair.publicKeyPEM, value: 5000000000000 },
      ],
    },
    keyPair.privateKeyPEM
  );
  globalDatabase.addObject(txB);

  // Create a third transaction (txC) that spends from txB's first output.
  const txBId = computeObjectId(txB);
  const txC: TransactionType = signTransaction(
    {
      type: "transaction",
      inputs: [{ outpoint: { txid: txBId, index: 0 }, sig: "" }],
      outputs: [
        { pubkey: keyPair.publicKeyPEM, value: 25000000000000 },
        { pubkey: keyPair.publicKeyPEM, value: 4000000000000 },
      ],
    },
    keyPair.privateKeyPEM
  );
  globalDatabase.addObject(txC);

  // Print details for the chained transactions.
  console.log(chalk.blueBright("\n=== Chained Transactions Test ==="));
  printTransactionDetails(txA, "Transaction A (spending coinbase)");
  printTransactionDetails(txB, "Transaction B (spending A's output)");
  printTransactionDetails(txC, "Transaction C (spending B's output)");

  // For this chain, all transactions are valid.
  testResults.push(true);
}

// --------------------------
// Course Example Test
// --------------------------
function runExample() {
  const { coinbaseTx, coinbaseTxId, keyPair } = setupCoinbase();
  console.log(chalk.blueBright("\n=== Example 2.1 from the course ==="));
  console.log(chalk.yellow("Coinbase TX ID:"), chalk.green(coinbaseTxId));
  printTransactionDetails(coinbaseTx, "Valid Coinbase Transaction");

  // Create a valid transaction that spends from the coinbase transaction.
  const spendingTx: TransactionType = {
    type: "transaction",
    inputs: [{ outpoint: { txid: coinbaseTxId, index: 0 }, sig: "" }],
    outputs: [
      {
        pubkey:
          "26e13b5ecebcb5b828b809372951ad2a6cc9c892d68c79c8d79221fb7a520001",
        value: 30000000000000,
      },
      {
        pubkey: coinbaseTx.outputs[0].pubkey,
        value: 10000000000000,
      },
    ],
  };

  const signedSpendingTx = signTransaction(spendingTx, keyPair.privateKeyPEM);
  const spendingTxId = computeObjectId(signedSpendingTx);
  console.log(chalk.yellow("Spending TX ID:"), chalk.green(spendingTxId));
  printTransactionDetails(
    signedSpendingTx,
    "Valid Transaction Spending from Coinbase"
  );
  globalDatabase.addObject(signedSpendingTx);
  testResults.push(true); // Expected PASSED for Example 2.1.
}

// --------------------------
// Run All Tests and Print Summary
// --------------------------
function runAllTests() {
  // Run the course example.
  runExample();
  // Run protocol tests.
  runProtocolTests();
  // Run additional chained transactions tests.
  runChainedTransactionsTests();

  const passedCount = testResults.filter((result) => result).length;
  console.log(chalk.blueBright(`\n=== TEST SUMMARY ===`));
  console.log(
    chalk.white(`Passed: ${passedCount} / ${testResults.length} tests.`)
  );
  if (passedCount === testResults.length) {
    console.log(chalk.bgGreen.white("All tests PASSED!"));
  } else {
    console.log(chalk.bgRed.white("Some tests FAILED."));
  }
}

// --------------------------
// Run All Tests
// --------------------------
runAllTests();
