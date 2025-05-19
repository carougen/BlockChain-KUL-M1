import { logger } from './logger'
import { MessageSocket } from './network'
import {
  Message,
  HelloMessage,
  HelloMessageType,
  ErrorMessageType,
} from './message'
import { peerManager } from './peermanager'
import { canonicalize } from 'json-canonicalize'

const VERSION = '0.10.1'
const NAME = 'TODO: NAME YOUR NODE' /* TODO */

const INVALID_FORMAT = 'INVALID_FORMAT'
const INVALID_HANDSHAKE = 'INVALID_HANDSHAKE'

export class Peer {
  active: boolean = false
  socket: MessageSocket
  handshakeCompleted: boolean = false
  peerAddr: string

  async sendHello() {
    this.sendMessage({
      type: 'hello',
      version: VERSION,
      agent: NAME
    })
  }
  async sendGetPeers() {
    /* TODO */
  }
  async sendPeers() {
    /* TODO */
  }
  async sendError(msg: string, name: string) {
    this.sendMessage({
      type: 'error',
      msg: msg,
      name: name
    })
  }
  sendMessage(obj: object) {
    const message: string = canonicalize(obj)

    this.debug(`Sending message: ${message}`)
    this.socket.sendMessage(message)
  }
  async fatalError(msg: string, name: string) {
    await this.sendError(msg, name)
    this.warn(`Peer error: ${name}: ${msg}`)
    this.fail()
  }
  async fail() {
    this.active = false
    this.socket.end()
    peerManager.peerFailed(this.peerAddr)
  }
  async onConnect() {
    this.active = true

    setTimeout(() => {
      if (!this.handshakeCompleted) {
        logger.info(
          `Peer ${this.peerAddr} failed to handshake within time limit.`
        )
        this.fatalError('No handshake within time limit.', INVALID_HANDSHAKE)
      }
    }, 20000)

    await this.sendHello()
    // TODO: await this.sendGetPeers()
  }
  async onMessage(message: string) {
    this.debug(`Message arrival: ${message}`)

    let msg: object = {}

    try {
      msg = JSON.parse(message)
      this.debug(`Parsed message into: ${JSON.stringify(msg)}`)
    }
    catch {
      return await this.fatalError(`Failed to parse incoming message as JSON: ${message}`, INVALID_FORMAT)
    }

    this.info(this.handshakeCompleted.toString())

    if (!this.handshakeCompleted) {
       if (HelloMessage.guard(msg)) {
        return this.onMessageHello(msg)
      }
      return await this.fatalError(`Received message ${message} prior to "hello"`, INVALID_HANDSHAKE)
    }

    // for now, ignore messages that have a valid type but that we don't yet know how to parse
    // TODO: remove
    if('type' in msg)
      {
        if(typeof msg.type === 'string')
        {
          // Add the message type to the list of known message types
          if(['ihaveobject', 'getobject', 'object', 'getchaintip', 'chaintip', 'getmempool', 'mempool', 'peers', 'getpeers'].includes(msg.type))
            return
        }
      }

    // Message.guard() checks that the message is one of the known message formats in the Messages enum Union(...)
    if (!Message.guard(msg)) {
      // Message.validate() checks if the message is missing required fields
      const validation = Message.validate(msg)
      return await this.fatalError(
        `The received message does not match one of the known message formats: ${message}
             Validation error: ${JSON.stringify(validation)}`, INVALID_FORMAT
      )
    }

    // TODO 
    Message.match(
      async () => {
        return await this.fatalError(`Received a second "hello" message, even though handshake is completed`, INVALID_HANDSHAKE)
      },
      /*this.onMessageGetPeers.bind(this),
      this.onMessagePeers.bind(this),
      this.onMessageIHaveObject.bind(this),
      this.onMessageGetObject.bind(this),
      this.onMessageObject.bind(this),
      this.onMessageGetChainTip.bind(this),
      this.onMessageChainTip.bind(this),
      this.onMessageGetMempool.bind(this),
      this.onMessageMempool.bind(this),*/
      this.onMessageError.bind(this)
    )(msg)
  }

  async onMessageHello(msg: HelloMessageType) {
    let regex = new RegExp("^0\\.10\\.\\d$");
    if (!regex.test(msg.version)) {
      return await this.fatalError(`You sent an incorrect version (${msg.version}), which is not compatible with this node's version ${VERSION}.`, INVALID_FORMAT)
    }
    this.info(`Handshake completed. Remote peer running ${msg.agent} at protocol version ${msg.version}`)
    this.handshakeCompleted = true
  }

  async onMessageError(msg: ErrorMessageType) {
    this.warn(`Peer reported error: ${msg.name}: ${msg.msg}`)
  }

  // async onMessagePeers(msg: PeersMessageType) {
  //   /* TODO */
  // }
  // async onMessageGetPeers(msg: GetPeersMessageType) {
  /* TODO */
  // }

  log(level: string, message: string, ...args: any[]) {
    logger.log(
      level,
      `[peer ${this.socket.peerAddr}:${this.socket.netSocket.remotePort}] ${message}`,
      ...args
    )
  }
  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args)
  }
  info(message: string, ...args: any[]) {
    this.log('info', message, ...args)
  }
  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args)
  }
  constructor(socket: MessageSocket, peerAddr: string) {
    this.socket = socket
    this.peerAddr = peerAddr

    socket.netSocket.on('connect', this.onConnect.bind(this))
    socket.netSocket.on('error', (err: Error) => {
      this.warn(`Socket error: ${err}`)
      this.fail()
    })
    socket.on('message', this.onMessage.bind(this))
  }
}
