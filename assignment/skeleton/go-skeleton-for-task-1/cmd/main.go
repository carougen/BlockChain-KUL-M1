package main

import (
	"bitmunt/conn"

	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {

	// Define the name and port for the peer-to-peer network
	nodeName := "TODO: NAME YOUR NODE"
	port := "18018"

	// Initialize the PeerManager
	pm := conn.NewPeerManager(nodeName, port)

	// Start listening for incoming connections in a separate goroutine
	go pm.StartListening()

	// Initiate outgoing connections to known peers
	go pm.ConnectToPeers()

	// Block the main thread until a shutdown signal is received
	waitForShutdown()

}

func waitForShutdown() {
	// Create a channel to listen for OS signals
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	// Block until a signal is received
	<-signalChan
	log.Println("Shutting down server...")
}
