package messenger

import (
	"bitmunt/logi"
	"bitmunt/message"
	"bitmunt/util"

	"fmt"
	"net"
)

func SendHelloMessage(conn net.Conn, agentName string) {
	helloMsg := message.HelloMessage{
		Type:    "hello",
		Version: "0.10.0",
		Agent:   agentName,
	}

	logi.LogSent(conn.RemoteAddr().String(), helloMsg)

	_, err := conn.Write(util.JsonMarshalwithEnd(helloMsg))
	if err != nil {
		fmt.Println("Error sending hello message:", err)
		return
	}
}
