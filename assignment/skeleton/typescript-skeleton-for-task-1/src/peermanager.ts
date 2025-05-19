import { logger } from './logger'


const BOOTSTRAP_PEERS: string[] = [
  '172.22.29.47:18018'
]

// The TODOs in all the files are just suggestions to guide you. 
// Feel free to add any additional logic or modify the code as needed. 
// In this file, your goal is to implement a working PeerManager that properly manages peers.

class PeerManager {
  knownPeers: Set<string> = new Set() // TODO: Manage a list of peers that will survive reboot

  async load() {
    this.knownPeers = new Set(BOOTSTRAP_PEERS)
  }
  async store() {
    /* TODO: store into database */
  }

  isValidDNSEntry(addr: string): boolean {
    /* TODO: */
    return true
  }

  isValidIpv4(addr: string): boolean {
    /* TODO: */
    return true
  }

  isValidHostname(addr: string): boolean {
    /* TODO: */
    return true
  }

  peerDiscovered(peerAddr: string) {
    /* TODO: */
  }
  peerFailed(peerAddr: string) {
    /* TODO: */
  }
}

export const peerManager = new PeerManager()
