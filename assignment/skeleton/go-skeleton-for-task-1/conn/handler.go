package conn

import (
	"bitmunt/logi"
	"bitmunt/message"
	"bitmunt/messenger"
	"log"
)

func handleMessage(pm *PeerManager, msgString string, connState *ConnectionState) {
	// parse the message
	msg, err := parseAndLogMessage(msgString, connState)
	if err != nil {
		return
	}

	if !connState.ReceivedHello {
		_, ok := msg.(message.HelloMessage)
		if !ok {
			messenger.SendErrorMessage(connState.Conn, "INVALID_HANDSHAKE", "Handshake first")
			pm.removeConnection(connState.Conn.RemoteAddr().String())
			return
		}
	}

	routeMessage(pm, msg, connState)
}

func parseAndLogMessage(msgString string, connState *ConnectionState) (interface{}, error) {
	msg, err := message.ParseMessage([]byte(msgString))
	if err != nil {
		log.Println("Error parsing message:", err)
		messenger.SendErrorMessage(connState.Conn, "INVALID_FORMAT", "Invalid message format")

		return nil, err
	}

	logi.LogReceived(connState.Conn.RemoteAddr().String(), msg)
	return msg, nil
}

func routeMessage(pm *PeerManager, msg interface{}, connState *ConnectionState) {
	switch m := msg.(type) {
	case message.HelloMessage:
		handleHello(pm, m, connState)
	// TODO: for other cases
	default:
		log.Println("Handler: Received unknown message type", msg) // Return errors or log unknown types
	}
}
