package conn

import (
	"bitmunt/messenger"
	"bufio"
	"context"
	"log"
	"net"
	"sync"
	"time"
)

type ConnectionState struct {
	Conn          net.Conn
	ReceivedHello bool
}

type PeerManager struct {
	port     string
	nodeName string
	mu       sync.Mutex
	peers    map[string]*ConnectionState
}

func NewPeerManager(nodeName string, port string) *PeerManager {
	return &PeerManager{
		nodeName: nodeName,
		port:     port,
		peers:    make(map[string]*ConnectionState),
	}
}

func (pm *PeerManager) handleConnection(conn net.Conn) {
	addr := conn.RemoteAddr().String()
	pm.addPeerConnection(addr, conn)

	defer pm.removeConnection(addr)

	// Send hello message whenever a new connection is established
	messenger.SendHelloMessage(conn, pm.nodeName)

	// Start a 20-second timer to close the connection if no HelloMessage is received
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	go func() {
		<-ctx.Done() // Wait until the timeout happens or cancellation occurs
		if ctx.Err() == context.DeadlineExceeded {
			// Timeout reached: No HelloMessage received in time
			log.Printf("⏳ Timeout: No HelloMessage received from %s. Closing connection.", addr)
			messenger.SendErrorMessage(conn, "INVALID_HANDSHAKE", "No handshake within 20 seconds")
			pm.removeConnection(addr)
		}
	}()

	reader := bufio.NewScanner(conn)
	for reader.Scan() {

		message := reader.Text()
		handleMessage(pm, message, pm.peers[addr])

		// If a HelloMessage is received, cancel the timeout
		if pm.peers[addr] != nil && pm.peers[addr].ReceivedHello {
			cancel()
		}
	}
}

// addPeerConnection adds a connection if it doesn’t already exist
func (pm *PeerManager) addPeerConnection(peerAddress string, conn net.Conn) bool {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if _, exists := pm.peers[peerAddress]; exists {
		log.Printf("Connection to peer %s already exists. Closing duplicate connection.", peerAddress)
		conn.Close()
		return false
	}

	pm.peers[peerAddress] = &ConnectionState{
		Conn:          conn,
		ReceivedHello: false,
	}

	log.Printf("new server %s connecting...", peerAddress)
	return true
}

// removeConnection removes a connection from the manager
func (pm *PeerManager) removeConnection(addr string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if connState, exists := pm.peers[addr]; exists {
		connState.Conn.Close()
		delete(pm.peers, addr)
		log.Printf("❌ Connection removed: %s", addr)
	}
}
