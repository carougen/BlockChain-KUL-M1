import * as net from "net";
import { logger } from "./logger";
import { Peer } from "./peer";
import { EventEmitter } from "events";
import { peerManager } from "./peermanager";

class Network {
  peers: Peer[] = [];

  async init(bindPort: number, bindIP: string) {
    logger.info(`🚀 [Network] Starting node on ${bindIP}:${bindPort}...`);

    await peerManager.load();

    // Create the server
    const server = net.createServer((socket: net.Socket) => {
      logger.info(
        `🔌 [Network - ${socket.remoteAddress}] Incoming connection.`
      );
      const peer = new Peer(
        new MessageSocket(
          socket,
          `${socket.remoteAddress}:${socket.remotePort}`
        ),
        `${socket.remoteAddress}:${socket.remotePort}`
      );
      this.peers.push(peer);
      peer.onConnect();
    });

    logger.info(`✅ [Network] Listening on ${bindIP}:${bindPort}`);
    server.listen(bindPort, bindIP);

    const MAX_ACTIVE_PEERS = 5;
    const peersToConnect = peerManager.getRandomPeers(MAX_ACTIVE_PEERS);
    for (const peerAddr of peersToConnect) {
      logger.info(`📡 [Network - ${peerAddr}] Attempting connection.`);
      try {
        const peer = new Peer(MessageSocket.createClient(peerAddr), peerAddr);
        this.peers.push(peer);
      } catch (e: any) {
        logger.warn(
          `❌ [Network - ${peerAddr}] Failed to connect to peer : ${e.message}.`
        );
      }
    }
  }

  broadcast(obj: object) {
    logger.info(
      `📡 [Network] Broadcasting object to all peers: ${JSON.stringify(obj)}.`
    );
    for (const peer of this.peers) {
      if (peer.active) {
        peer.sendMessage(obj);
      }
    }
  }
}

export class MessageSocket extends EventEmitter {
  buffer: string = ""; // defragmentation buffer
  netSocket: net.Socket;
  peerAddr: string;
  /* TODO */

  /**
   * createClient() Creates a new MessageSocket instance that will connect to a peer at the
   * given address.
   *
   * @param peerAddr - The address of the peer to connect to, in the form
   *   "host:port".
   * @returns A new MessageSocket instance.
   */
  static createClient(peerAddr: string) {
    const [host, portStr] = peerAddr.split(":");
    const port = +portStr;
    if (port < 0 || port > 65535) {
      throw new Error("Invalid port");
    }
    const netSocket = new net.Socket();
    const socket = new MessageSocket(netSocket, peerAddr);

    netSocket.connect(port, host);

    return socket;
  }

  constructor(netSocket: net.Socket, peerAddr: string) {
    super();

    this.peerAddr = peerAddr;
    this.netSocket = netSocket;
    this.netSocket.on("data", (data: string) => {
      this.buffer += data;
      const messages = this.buffer.split("\n");

      if (messages.length > 1) {
        for (const message of messages.slice(0, -1)) {
          this.emit("message", message);
        }
        this.buffer = messages[messages.length - 1];
      }
    });
  }
  sendMessage(message: string) {
    this.netSocket.write(`${message}\n`);
  }
  end() {
    this.netSocket.end();
  }
}

export const network = new Network();
