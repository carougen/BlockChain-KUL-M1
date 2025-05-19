package conn

import (
	"bitmunt/message"
	"bitmunt/messenger"
	"log"
)

func handleHello(pm *PeerManager, msg message.HelloMessage, connState *ConnectionState) {
	peerAddr := connState.Conn.RemoteAddr().String()

	if connState.ReceivedHello {
		messenger.SendErrorMessage(connState.Conn, "INVALID_HANDSHAKE", "Handshake already received")
		pm.removeConnection(peerAddr)
		return
	} else {
		log.Println("👋 First time received hello from peer:", peerAddr)
		pm.updateReceivedHello(peerAddr, true)

		log.Println("✅ Connection established with peer:", peerAddr)
	}
}

// updateReceivedHello() updates the handshake state for a peer
func (pm *PeerManager) updateReceivedHello(addr string, receivedHello bool) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if connState, exists := pm.peers[addr]; exists {
		connState.ReceivedHello = receivedHello
		log.Printf("Updated handshake state for %s: ReceivedHello = %v", addr, receivedHello)
	}
}

// handleHandshake is the handler for the handshake process. It's called when a new message is
// received from a peer. If the message is a HelloMessage, it marks the peer as having
// completed the handshake and logs the success. If not, it sends an error message and
// closes the connection to the peer.

func handleHandshake(pm *PeerManager, msg interface{}, connState *ConnectionState) {
	peerAddr := connState.Conn.RemoteAddr().String()
	if _, ok := msg.(message.HelloMessage); ok {
		// if it is the first time
		log.Println("👋 First time received hello from peer:", peerAddr)
		pm.updateReceivedHello(peerAddr, true)

		log.Println("✅ Connection established with peer:", peerAddr)
	} else {
		messenger.SendErrorMessage(connState.Conn, "INVALID_HANDSHAKE", "Handshake first")
		pm.removeConnection(peerAddr)
	}
}
