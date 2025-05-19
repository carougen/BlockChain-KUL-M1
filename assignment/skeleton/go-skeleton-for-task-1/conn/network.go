package conn

import (
	"log"
	"net"
	"time"
)

// StartServer() starts the server for incoming connections.
// It listens on the specified port and for each incoming connection, it starts a new goroutine to handle it.
func (pm *PeerManager) StartListening() {
	listener, err := net.Listen("tcp", "0.0.0.0:"+pm.port)
	if err != nil {
		log.Fatalf("Failed to start server on port %s: %v", pm.port, err)
	}
	defer listener.Close()

	log.Printf("Server listening on port %s", pm.port)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Failed to accept connection: %v", err)
			continue
		}
		go pm.handleConnection(conn)
	}
}

// DialPeers() initiates outgoing connections to known peers.
//
// This function takes care of periodically attempting to connect to peers
// that are known to exist. It is intended to be called periodically.
func (pm *PeerManager) ConnectToPeers() {
	// TODO: manage a list of discovered peers locally. This list should survive reboots
	addresses := []string{"172.22.29.47:18018"} // peer addresses

	for _, address := range addresses {
		log.Printf("📲 Dialing peer: %s", address)
		conn, err := net.Dial("tcp", address)
		if err != nil {
			log.Printf("Failed to connect to peer %s: %v", address, err)
			continue
		}

		// Enable TCP keep-alive
		tcpConn := conn.(*net.TCPConn)
		tcpConn.SetKeepAlive(true)
		tcpConn.SetKeepAlivePeriod(30 * time.Second)

		go pm.handleConnection(conn)
	}
}
