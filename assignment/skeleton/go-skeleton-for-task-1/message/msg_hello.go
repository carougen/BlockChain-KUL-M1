package message

import (
	"bitmunt/util"
	"encoding/json"
	"errors"
)

type HelloMessage struct {
	Type    string `json:"type"`
	Version string `json:"version"`
	Agent   string `json:"agent,omitempty"` // Optional
}

func NewHelloMessage(version, agent string) HelloMessage {
	return HelloMessage{
		Type:    "hello",
		Version: version,
		Agent:   agent,
	}
}

func (m *HelloMessage) Serialize() ([]byte, error) {
	msg, err := util.JsonMarshal(m)
	if err != nil {
		return nil, err
	}
	return msg, nil
}

func DeserializeHello(data []byte) (*HelloMessage, error) {
	var msg HelloMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
	}
	if msg.Type != "hello" {
		return nil, errors.New("invalid message type")
	}
	return &msg, nil
}
