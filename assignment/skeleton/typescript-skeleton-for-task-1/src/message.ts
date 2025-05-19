import { Literal,
         Record, Array, Union,
         String, Number,
         Static, Null, Unknown, Optional } from 'runtypes'

export const HelloMessage = Record({
  type: Literal('hello'),
  version: String,
  agent: String
})
export type HelloMessageType = Static<typeof HelloMessage>


export const ErrorMessage = Record({
  type: Literal('error'),
  msg: String,
  name: Union(
    Literal('INTERNAL_ERROR'),
    Literal('INVALID_FORMAT'), 
    Literal('UNKNOWN_OBJECT'), 
    Literal('UNFINDABLE_OBJECT'), 
    Literal('INVALID_HANDSHAKE'), 
    Literal('INVALID_TX_OUTPOINT'), 
    Literal('INVALID_TX_SIGNATURE'), 
    Literal('INVALID_TX_CONSERVATION'), 
    Literal('INVALID_BLOCK_COINBASE'), 
    Literal('INVALID_BLOCK_TIMESTAMP'), 
    Literal('INVALID_BLOCK_POW'), 
    Literal('INVALID_GENESIS'), 
  )})

export type ErrorMessageType = Static<typeof ErrorMessage>

export const Messages = [
  HelloMessage,
  /* TODO */
  ErrorMessage
]


export const Message = Union(
  HelloMessage,
  /* TODO */
  ErrorMessage
)
export type MessageType = Static<typeof Message>
