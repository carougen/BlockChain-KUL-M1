package message

import (
	"bitmunt/util"
	"encoding/json"
	"fmt"
)

type BaseMessage struct {
	Type string `json:"type"`
}

func (m *BaseMessage) Serialize() []byte {
	data, err := util.JsonMarshal(m)
	if err != nil {
		return nil
	}
	return append(data, '\n')
}

// ParseMessage parses the incoming JSON message and returns the appropriate struct
func ParseMessage(data []byte) (interface{}, error) {
	var base BaseMessage
	if err := json.Unmarshal(data, &base); err != nil {
		return nil, fmt.Errorf("invalid JSON format: %w", err)
	}

	switch base.Type {
	case "hello":
		var msg HelloMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("invalid 'hello' message format: %w", err)
		}
		return msg, nil
	case "error":
		var msg ErrorMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return nil, fmt.Errorf("invalid 'error' message format: %w", err)
		}
		return msg, nil

	// TODO:Add cases for other message types

	default:
		return base, nil
		// TODO: conduct proper checks.
		// return nil, fmt.Errorf("unknown message type: %s", base.Type), "unknown"
	}
}
