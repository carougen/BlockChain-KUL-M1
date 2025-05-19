import { globalDatabase, computeObjectId } from "../database";

function runTests() {
  const db = globalDatabase;

  const genesisBlock = {
    T: "0000000abc000000000000000000000000000000000000000000000000000000",
    created: 1740224556,
    miner: "Bitmunt",
    nonce: "0000000000000000000000000000000000000000000000000000000001d38904",
    note: "VRT News 2025-02-02: 2 op de 5 IC-treinen en geen P-treinen: nmbs verwacht maandag grote hinder",
    previd: null,
    txids: [],
    type: "block",
  };

  const expectedGenesisId =
    "00000003aa05a8b3ec33a789d2a28a8ece1b33141eb23b4d4b5715685d7a8471";

  const computedGenesisId = computeObjectId(genesisBlock);
  console.log("Computed Genesis Block ID:", computedGenesisId);
  console.log("Expected Genesis Block ID:", expectedGenesisId);

  if (computedGenesisId === expectedGenesisId) {
    console.log("Genesis Block ID is correct.");
  } else {
    console.error("Genesis Block ID is incorrect!");
  }

  console.log("\nAdding Genesis Block to the database...");
  const addedId = db.addObject(genesisBlock);
  console.log("Added Genesis Block ID:", addedId);

  console.log("\nRetrieving Genesis Block from the database...");
  const retrievedBlock = db.getObject(addedId);
  console.log(
    "Retrieved Genesis Block:",
    JSON.stringify(retrievedBlock, null, 2)
  );

  console.log(
    "\nCurrent Database contents:",
    JSON.stringify(db.getAllObjects(), null, 2)
  );
}

runTests();
