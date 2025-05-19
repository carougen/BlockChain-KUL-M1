# Bitmunt - TypeScript skeleton code 

npm version is 10.8.1

tsc version is 5.1.6

## How to run the program

### With Docker 
you will have to install Docker first. 

Then run: 
```bash
docker build -t bitmunt-ts-app .

docker run -p 18018:18018 bitmunt-ts-app
```

### Without Docker 
In the root dir, run:

```bash 
npm i 
tsc 
npm run start 
```

If you get errors try with this:

```bash
npm i
npm install -D typescript
npm install -D ts-node
npm install -D tslib @types/node
tsc
npm run start
```



## To test if your node is running correctly

```bash
# open another tab
nc -vvv 0.0.0.0 18018

# Some messages you can send to test
{"agent":"test","type":"hello","version":"0.10.0"}

{"description":"test error","name":"INVALID_HANDSHAKE","type":"error"}

```
