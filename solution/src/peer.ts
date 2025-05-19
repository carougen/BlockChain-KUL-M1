import { logger } from "./logger";
import { MessageSocket, network } from "./network";
import {
  Message,
  HelloMessage,
  HelloMessageType,
  ErrorMessageType,
  PeersMessageType,
  GetPeersMessageType,
  IHaveObjectMessageType,
  GetObjectMessageType,
  ObjectMessageType,
} from "./message";
import { peerManager } from "./peermanager";
import { canonicalize } from "json-canonicalize";
import { globalDatabase, computeObjectId } from "./database";
import { globalUTXO } from "./utxo";
import { TransactionValidator } from "./transaction";
import { BlockValidator, pendingBlockTxIds, blockHeights } from "./block";
import { objectWaiter } from "./objectWaiter";
import { REQUIRED_TARGET } from "./block";
import {
  mempoolTxIds,
  tryAddToMempool,
  updateMempoolOnBlock,
  updateMempoolOnReorg,
} from "./mempool";
import { scanAndSend } from "./payments";
import { PUBLIC_KEY_DEST } from "./keys";

const VERSION = "0.10.1";
const NAME = "BitMuntNodeB1";

const INVALID_FORMAT = "INVALID_FORMAT";
const INVALID_HANDSHAKE = "INVALID_HANDSHAKE";

export class Peer {
  active: boolean = false;
  socket: MessageSocket;
  handshakeCompleted: boolean = false;
  peerAddr: string;
  private invalidBlocks: Set<string> = new Set();

  constructor(socket: MessageSocket, peerAddr: string) {
    this.socket = socket;
    this.peerAddr = peerAddr;

    socket.netSocket.on("connect", this.onConnect.bind(this));
    socket.netSocket.on("error", (err: Error) => {
      this.warn(`[Peer] Socket error: ${err.message}`);
      this.fail();
    });
    socket.on("message", this.onMessage.bind(this));
  }

  ///
  /// Send message part
  ///

  async sendError(msg: string, name: string) {
    this.sendMessage({
      type: "error",
      msg: msg,
      name: name,
    });
  }

  async fatalError(msg: string, name: string) {
    await this.sendError(msg, name);
    this.warn(`Peer error: ${name}: ${msg}`);
    this.fail();
  }

  async fail() {
    this.active = false;
    this.socket.end();
    peerManager.peerFailed(this.peerAddr);
  }

  async sendHello() {
    this.sendMessage({
      type: "hello",
      version: VERSION,
      agent: NAME,
    });
  }

  sendMessage(obj: object) {
    const message: string = canonicalize(obj);
    logger.debug(`📤 [Peer - ${this.peerAddr}] Sending message: ${message}.`);
    this.socket.sendMessage(message);
  }

  async sendGetPeers() {
    this.sendMessage({ type: "getpeers" });
  }

  async sendPeers() {
    const peersList = peerManager.getRandomPeers(30);
    this.sendMessage({ type: "peers", peers: peersList });
  }

  async sendGetChainTip() {
    this.sendMessage({ type: "getchaintip" });
  }

  async sendGetMemPool() {
    this.sendMessage({ type: "getmempool" });
  }

  ////
  //// OnMessage part
  ////

  async onConnect() {
    this.active = true;
    logger.info(
      `🤝 [Peer - ${this.peerAddr}] Connected, waiting for handshake...`
    );

    setTimeout(() => {
      if (!this.handshakeCompleted) {
        logger.warn(`⚠️ [Peer - ${this.peerAddr}] Handshake timeout.`);
        this.fatalError("No handshake within time limit.", INVALID_HANDSHAKE);
      }
    }, 20000);

    await this.sendHello();
    await this.sendGetMemPool();
    await this.sendGetPeers();
    await this.sendGetChainTip();
  }

  async onMessage(message: string) {
    logger.debug(`📥 [Peer - ${this.peerAddr}] Received message : ${message}.`);

    let msg: object = {};

    try {
      msg = JSON.parse(message);
    } catch (error) {
      logger.error(`❌ [Peer - ${this.peerAddr}] Invalid JSON : ${message}.`);
      await this.fatalError("Invalid JSON format", "INVALID_FORMAT");
      return;
    }

    // Message.guard() checks that the message is one of the known message formats in the Messages enum Union(...)
    if (!Message.guard(msg)) {
      logger.error(
        `❌ [Peer - ${this.peerAddr}] Message does not conform to valid formats : ${message}.`
      );
      return await this.fatalError(
        "Message does not match known format",
        INVALID_FORMAT
      );
    }

    if (!this.handshakeCompleted) {
      if (HelloMessage.guard(msg)) {
        return this.onMessageHello(msg);
      }
      logger.error(
        `❌ [Peer - ${this.peerAddr}] Received non-hello message before handshake : ${message}.`
      );
      return await this.fatalError(
        `Received message ${message} prior to "hello"`,
        INVALID_HANDSHAKE
      );
    }

    // TODO
    Message.match(
      async () => {
        return await this.fatalError(
          `Received a second "hello" message, even though handshake is completed.`,
          INVALID_HANDSHAKE
        );
      },
      this.onMessagePeers.bind(this),
      this.onMessageGetPeers.bind(this),
      this.onMessageError.bind(this),
      this.onMessageIHaveObject.bind(this),
      this.onMessageGetObject.bind(this),
      this.onMessageObject.bind(this),
      this.onMessageGetChainTip.bind(this),
      this.onMessageChainTip.bind(this),
      this.onMessageGetMempool.bind(this),
      this.onMessageMempool.bind(this)
    )(msg);
  }

  async onMessageHello(msg: HelloMessageType) {
    let regex = new RegExp("^0\\.10\\.\\d$");
    if (!regex.test(msg.version)) {
      return await this.fatalError(
        `You sent an incorrect version (${msg.version}), which is not compatible with this node's version ${VERSION}.`,
        INVALID_FORMAT
      );
    }
    logger.info(
      `✅ [Peer - ${this.peerAddr}] Handshake completed. Remote peer running ${msg.agent} at protocol version ${msg.version}.`
    );
    // this.info(`Handshake completed. Remote peer running ${msg.agent} at protocol version ${msg.version}`)
    this.handshakeCompleted = true;
  }

  async onMessageError(msg: ErrorMessageType) {
    this.warn(`Peer reported error: ${msg.name}: ${msg.msg}`);
  }

  async onMessagePeers(msg: PeersMessageType) {
    if (!Array.isArray(msg.peers)) return;

    for (const peer of msg.peers) {
      peerManager.peerDiscovered(peer);
    }
    logger.info(
      `✅ Updated peer list from ${this.peerAddr} with ${msg.peers.length} peers.`
    );
  }

  async onMessageGetPeers(msg: GetPeersMessageType) {
    this.sendPeers();
  }

  async onMessageIHaveObject(msg: IHaveObjectMessageType) {
    const objectId = msg.objectid;
    if (!globalDatabase.getObject(objectId)) {
      logger.info(
        `📥 [Peer - ${this.peerAddr}] IHaveObject received, requesting object: ${objectId}`
      );
      this.sendMessage({ type: "getobject", objectid: objectId });
    } else {
      logger.debug(
        `🐞 [Peer - ${this.peerAddr}] IHaveObject received, but object ${objectId} is already in the database.`
      );
    }
  }

  async onMessageGetObject(msg: GetObjectMessageType) {
    const objectId = msg.objectid;
    const obj = globalDatabase.getObject(objectId);
    if (obj) {
      logger.info(`📤 [Peer - ${this.peerAddr}] Sending object: ${objectId}.`);
      this.sendMessage({ type: "object", object: obj });
    } else {
      logger.warn(
        `❌ [Peer - ${this.peerAddr}] Requested object not found: ${objectId}.`
      );
      this.sendError(`Object ${objectId} is not known`, "UNKNOWN_OBJECT");
    }
  }

  async onMessageObject(msg: ObjectMessageType) {
    const obj = msg.object as any;
    const objectId = computeObjectId(obj);

    // Ignore if we already know it
    if (globalDatabase.getObject(objectId)) {
      logger.info(`📥 [Peer] Object ${objectId} already known, ignoring.`);
      return;
    }

    // TRANSACTIONS
    if (obj.type === "transaction") {
      // Validate its intrinsic structure & signatures first
      const validationError = TransactionValidator.validateTransaction(obj);
      if (validationError !== null) {
        logger.warn(
          `❌ [Peer] Invalid transaction ${objectId}: ${validationError}`
        );
        return this.sendError(
          `Transaction ${objectId} is invalid: ${validationError}`,
          validationError
        );
      }

      const isCoinbase =
        "height" in obj && (!obj.inputs || obj.inputs.length === 0);

      // Coinbase: only accept if it was requested by SubBlockValidator
      if (isCoinbase) {
        // Store & notify waiters, never into mempool
        globalDatabase.addObject(obj);
        pendingBlockTxIds.delete(objectId);
        logger.info(
          `✅ [Peer] Stored coinbase tx ${objectId} for pending block`
        );
        objectWaiter.notify(objectId, obj);
        return;
      }

      // Pending‐block path: a non‐coinbase tx we asked for as part of a block
      if (pendingBlockTxIds.has(objectId)) {
        globalDatabase.addObject(obj);
        pendingBlockTxIds.delete(objectId);
        logger.info(`📥 [Peer] Stored pending‐block tx ${objectId}`);
        objectWaiter.notify(objectId, obj);
        return;
      }

      // Normal tx → mempool
      globalDatabase.addObject(obj);
      logger.info(`📥 [Peer] Attempting to add tx ${objectId} to mempool`);
      const memErr = tryAddToMempool(objectId);
      if (memErr === null) {
        logger.info(`✅ [Peer] Transaction ${objectId} added to mempool`);
        // Broadcast so peers know we have it
        network.broadcast({ type: "ihaveobject", objectid: objectId });
        objectWaiter.notify(objectId, obj);
      } else {
        logger.warn(
          `❌ [Peer] Could not add tx ${objectId} to mempool: ${memErr}`
        );
        this.sendError(`Transaction ${objectId} rejected: ${memErr}`, memErr);
      }
      return;
    }

    // BLOCK
    if (obj.type === "block") {
      const objectId = computeObjectId(obj);
      const parentId = obj.previd;
      const oldTip = globalDatabase.getChainTip()!;
      const oldHeight = blockHeights.get(oldTip)!;

      if (this.invalidBlocks.has(parentId)) {
        this.sendError(
          `Block ${objectId} references invalid parent ${parentId}`,
          "UNFINDABLE_OBJECT"
        );
        return;
      }

      // Full block validation
      const error = await BlockValidator.validateBlock(obj, globalUTXO);
      if (error) {
        this.invalidBlocks.add(objectId);
        logger.warn(`❌ [Peer] Invalid block ${objectId}: ${error}`);
        return this.fatalError(`Invalid block received`, error);
      }

      // Store the block
      globalDatabase.addObject(obj);
      logger.info(`✅ [Peer] Stored new block ${objectId}`);

      // Recompute its height
      const newHeight = (blockHeights.get(parentId) ?? oldHeight) + 1;
      blockHeights.set(objectId, newHeight);

      // 1) Only do reorg if fork *and* chain is longer
      if (parentId !== oldTip && newHeight > oldHeight) {
        logger.info(
          `🔄 [Peer] Detected chain reorg: new block ${objectId} ` +
            `(height ${newHeight}) forks from ${parentId}, ` +
            `old tip ${oldTip} at height ${oldHeight}`
        );

        // Gather abandoned blocks back to fork point
        const abandoned: any[] = [];
        let cursor = oldTip;
        while (cursor && cursor !== parentId) {
          const blk = await BlockValidator.fetchBlock(cursor);
          abandoned.push(blk);
          cursor = blk.previd;
        }

        // Gather adopted blocks from fork point up to new block
        const adopted: any[] = [];
        cursor = objectId;
        while (cursor && cursor !== parentId) {
          const blk = await BlockValidator.fetchBlock(cursor);
          adopted.unshift(blk);
          cursor = blk.previd;
        }

        // Rebuild mempool: first abandoned‐fork txs, then surviving mempool txs
        const oldMempoolTxs = mempoolTxIds
          .map((txid) => globalDatabase.getObject(txid))
          .filter((tx): tx is any => tx != null);
        const abandonedTxs = abandoned
          .flatMap((b) => b.txids)
          .map((txid) => globalDatabase.getObject(txid))
          .filter((tx): tx is any => tx != null);

        updateMempoolOnReorg(abandonedTxs, oldMempoolTxs);
        logger.info(
          `✅ [Peer] Mempool reorg done, ${mempoolTxIds.length} tx(s) remain`
        );
      }

      // 2) Prune any now-confirmed txs
      logger.info(`🔄 [Peer] Pruning mempool with new block ${objectId}`);
      updateMempoolOnBlock(obj);
      logger.info(`✅ [Peer] Mempool now ${mempoolTxIds.length} tx(s)`);

      // 3) Finally, update tip if this really is a longer chain
      if (newHeight > oldHeight) {
        globalDatabase.setChainTip(objectId);
        logger.info(
          `🌟 [Peer] Chain tip updated to ${objectId} (height ${newHeight})`
        );
      }

      // 4) Broadcast + notify
      network.broadcast({ type: "ihaveobject", objectid: objectId });
      objectWaiter.notify(objectId, obj);
      this.invalidBlocks.delete(objectId);
      return;
    }

    // Unknown type
    logger.info(`📥 [Peer] Unknown object type, ignoring.`);
    return this.sendError(`Unknown object type.`, "UNKNOWN_OBJECT");
  }

  async onMessageGetChainTip(msg: any) {
    // When a peer asks for our chain tip
    const chainTipId = globalDatabase.getChainTip();
    if (chainTipId) {
      this.sendMessage({ type: "chaintip", blockid: chainTipId });
    }
  }

  async onMessageChainTip(msg: { blockid: string }) {
    const advertisedTip = msg.blockid;
    const currentTip = globalDatabase.getChainTip();
    const currentHeight = currentTip ? blockHeights.get(currentTip)! : -1;

    logger.info(
      `📥 Peer advertised tip ${advertisedTip}. ` +
        `Our tip is ${currentTip} at height ${currentHeight}.`
    );

    let blk = globalDatabase.getObject(advertisedTip);
    if (!blk) {
      // We don’t have it yet -> fetch, then return.
      this.sendMessage({ type: "getobject", objectid: advertisedTip });
      return;
    }

    // Validate (this also sets blockHeights for this block)
    const err = await BlockValidator.validateBlock(blk, globalUTXO.clone());
    if (err) {
      this.invalidBlocks.add(advertisedTip);
      logger.warn(`❌ Invalid advertised block ${advertisedTip}: ${err}`);
      return this.fatalError(`Invalid block ${advertisedTip} received`, err);
    }

    // Now read its height (must exist thanks to validateBlock)
    const advertisedHeight = blockHeights.get(advertisedTip)!;

    // Only switch if strictly longer
    if (advertisedHeight > currentHeight) {
      globalDatabase.setChainTip(advertisedTip);
      logger.info(
        `🌟 Chain tip updated to ${advertisedTip} (height ${advertisedHeight} > ${currentHeight})`
      );
    } else {
      logger.debug(
        `🐞 Advertised tip ${advertisedTip} (height ${advertisedHeight}) ` +
          `is not higher than current; ignoring.`
      );
    }
  }

  async onMessageGetMempool(_: any) {
    // Log receipt of the getmempool request
    logger.info(
      `📥 [Peer - ${this.peerAddr}] Received getmempool request, sending ${mempoolTxIds.length} txids.`
    );

    // Send back a mempool message listing all tx IDs
    this.sendMessage({
      type: "mempool",
      txids: mempoolTxIds,
    });
  }

  async onMessageMempool(msg: { txids: string[] }) {
    // Log receipt of the mempool listing
    logger.info(
      `📥 [Peer - ${this.peerAddr}] Received mempool listing with ${msg.txids.length} txids.`
    );

    // Iterate through each advertised txid
    for (const txid of msg.txids) {
      // If we don’t already have this transaction...
      if (!globalDatabase.getObject(txid)) {
        // Debug-log that we’re about to request it
        logger.debug(
          `🐞 [Peer - ${this.peerAddr}] Missing tx ${txid}, sending getobject.`
        );

        // Ask the peer for the full transaction object
        this.sendMessage({
          type: "getobject",
          objectid: txid,
        });
      } else {
        // Debug-log that we already have it and will skip fetching
        logger.debug(
          `🐞 [Peer - ${this.peerAddr}] Already have tx ${txid}, skipping request.`
        );
      }
    }
  }

  ///
  /// Logger
  ///

  log(level: string, message: string, logo: string, ...args: any[]) {
    logger.log(
      level,
      `${logo} [Peer - ${this.socket.peerAddr}:${this.socket.netSocket.remotePort}] ${message}`,
      ...args
    );
  }
  warn(message: string, ...args: any[]) {
    this.log("warn", message, "❌", ...args);
  }
  info(message: string, ...args: any[]) {
    this.log("info", message, "ℹ️", ...args);
  }
  debug(message: string, ...args: any[]) {
    this.log("debug", message, "🐞", ...args);
  }
}
