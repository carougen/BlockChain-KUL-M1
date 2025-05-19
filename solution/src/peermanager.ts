import { logger } from "./logger";
import * as fs from "fs";

const PEERS_FILE = "data/peers.json";

const BOOTSTRAP_PEERS: string[] = ["172.23.31.55:18018"];

class PeerManager {
  knownPeers: Set<string> = new Set();

  async load() {
    logger.info(`🔄 [PeerManager] Loading peers from '${PEERS_FILE}'...`);
    try {
      if (fs.existsSync(PEERS_FILE)) {
        const storedPeers = fs.readFileSync(PEERS_FILE, "utf8").trim();
        this.knownPeers = storedPeers
          ? new Set(JSON.parse(storedPeers))
          : new Set();
      } else {
        this.knownPeers = new Set();
        logger.warn(`⚠️ [PeerManager] No existing peer file found.`);
      }
      for (const bp of BOOTSTRAP_PEERS) {
        this.knownPeers.add(bp);
      }
      fs.writeFileSync(
        PEERS_FILE,
        JSON.stringify([...this.knownPeers], null, 2),
        "utf8"
      );
      logger.info(
        `✅ [PeerManager] Peers loaded: ${[...this.knownPeers].join(", ")}`
      );
    } catch (error) {
      logger.error(
        `❌ [PeerManager] Error loading peers: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      this.knownPeers = new Set(BOOTSTRAP_PEERS);
    }
  }

  async store() {
    try {
      fs.writeFileSync(
        PEERS_FILE,
        JSON.stringify([...this.knownPeers], null, 2),
        "utf8"
      );
      logger.info(`✅ [PeerManager] Peers successfully updated.`);
    } catch (error) {
      logger.error(
        `❌ [PeerManager] Error storing peers: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  isValidDNSEntry(host: string): boolean {
    // The string must only contain letters, digits, dots, hyphens, or underscores,
    // and its length must be between 3 and 50 characters.
    const dnsRegex = /^[a-zA-Z0-9.\-_]{3,50}$/;
    if (!dnsRegex.test(host)) return false;
    // Must contain at least one dot that is neither at the start nor at the end.
    if (host.startsWith(".") || host.endsWith(".")) return false;
    if (!host.includes(".")) return false;
    // Must contain at least one letter.
    if (!/[a-zA-Z]/.test(host)) return false;
    return true;
  }

  isValidIpv4(host: string): boolean {
    const parts = host.split(".");
    if (parts.length !== 4) return false;
    for (const part of parts) {
      // Each part must be a numeric string and in the range [0, 255].
      if (!/^\d+$/.test(part)) return false;
      const num = Number(part);
      if (num < 0 || num > 255) return false;
    }
    return true;
  }

  isValidHostname(peerAddr: string): boolean {
    const parts = peerAddr.split(":");
    if (parts.length !== 2) {
      return false;
    }
    const [host, portStr] = parts;
    if (!host || !portStr) return false;

    // Validate host.
    if (!this.isValidDNSEntry(host) && !this.isValidIpv4(host)) {
      return false;
    }

    // Validate port.
    if (!/^\d+$/.test(portStr)) return false;
    const port = Number(portStr);
    if (port < 1 || port > 65535) return false;
    return true;
  }

  peerDiscovered(peerAddr: string) {
    if (!this.isValidHostname(peerAddr)) {
      logger.warn(
        `⚠️ [PeerManager] Invalid peer address received: ${peerAddr}`
      );
      return;
    }
    if (!this.knownPeers.has(peerAddr)) {
      this.knownPeers.add(peerAddr);
      logger.info(`🆕 [PeerManager] New peer discovered: ${peerAddr}`);
      this.store();
    }
  }

  peerFailed(peerAddr: string) {
    if (this.knownPeers.has(peerAddr)) {
      this.knownPeers.delete(peerAddr);
      logger.warn(`❌ [PeerManager] Peer removed: ${peerAddr}`);
      this.store();
    }
  }

  /*
  A good policy would have been to return the closest node but here we are not doing that
  since there is no distance store in the json.
  So we are just randomizing the json file.
  */

  getRandomPeers(max: number): string[] {
    // Convert the set of known peers into an array.
    const peersArray = Array.from(this.knownPeers);

    // If the number of peers is less than or equal to the max, return the entire array.
    if (peersArray.length <= max) {
      return peersArray;
    }

    // Shuffle the array using the Fisher-Yates algorithm.
    for (let i = peersArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [peersArray[i], peersArray[j]] = [peersArray[j], peersArray[i]];
    }

    // Return a slice of the array containing at most 'max' elements.
    return peersArray.slice(0, max);
  }
}

export const peerManager = new PeerManager();
