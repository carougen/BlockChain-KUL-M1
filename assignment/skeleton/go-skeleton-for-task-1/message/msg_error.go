package message

import (
	"bitmunt/util"
	"encoding/json"
	"errors"
)

// ErrorMessage represents an 'error' message
type ErrorMessage struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

func NewErrorMessage(name, description string) ErrorMessage {
	return ErrorMessage{
		Type:        "error",
		Name:        name,
		Description: description,
	}
}

func (m *ErrorMessage) Serialize() ([]byte, error) {
	msg, err := util.JsonMarshal(m)
	if err != nil {
		return nil, err
	}
	return msg, nil
}

func DeserializeError(data []byte) (*ErrorMessage, error) {
	var msg ErrorMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
	}
	if msg.Type != "error" {
		return nil, errors.New("invalid message type")
	}
	return &msg, nil
}
