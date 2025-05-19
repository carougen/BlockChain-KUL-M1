package util

import "github.com/gibson042/canonicaljson-go"

func JsonMarshalwithEnd(data interface{}) []byte {
	jsonData, err := canonicaljson.Marshal(data)
	if err != nil {
		return nil
	}
	// return jsonData
	return append(jsonData, '\n') // Add a newline character at the end of jsonData
}

func JsonMarshal(data interface{}) ([]byte, error) {
	jsonData, err := canonicaljson.Marshal(data)
	if err != nil {
		return nil, err
	}
	return jsonData, nil
}

func JsonUnmarshal(data []byte, v interface{}) error {
	return canonicaljson.Unmarshal(data, v)
}
