# Bitmunt - Go skeleton code 
go version 1.23

## How to run the program

### With Docker 
you will have to install Docker first. 

Then run: 
```bash
docker build -t bitmunt-go-app .

docker run -p 18018:18018 bitmunt-go-app
```

### Without Docker 
```bash
go run cmd/main
```

or 
```bash
go build -o main ./cmd

./main
```

## To test if your node is running correctly

```bash
# open another tab
nc -vvv 0.0.0.0 18018

# Some messages you can send to test
{"agent":"test","type":"hello","version":"0.10.0"}

{"description":"test error","name":"INVALID_HANDSHAKE","type":"error"}

```

