package messenger

import (
	"bitmunt/logi"
	"bitmunt/message"
	"bitmunt/util"

	"fmt"
	"net"
)

func SendErrorMessage(conn net.Conn, name, description string) {
	errorMsg := message.ErrorMessage{
		Type:        "error",
		Name:        name,
		Description: description,
	}

	logi.LogSent(conn.RemoteAddr().String(), errorMsg)

	_, err := conn.Write(util.JsonMarshalwithEnd(errorMsg))
	if err != nil {
		fmt.Println("Error sending error message:", err)
		return
	}
}
