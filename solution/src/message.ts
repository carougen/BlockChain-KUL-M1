import {
  Literal,
  Record,
  Array,
  Union,
  String,
  Static,
  Unknown,
} from "runtypes";

export const HelloMessage = Record({
  type: Literal("hello"),
  version: String,
  agent: String,
});

export type HelloMessageType = Static<typeof HelloMessage>;

export const ErrorMessage = Record({
  type: Literal("error"),
  msg: String,
  name: Union(
    Literal("INTERNAL_ERROR"),
    Literal("INVALID_FORMAT"),
    Literal("UNKNOWN_OBJECT"),
    Literal("UNFINDABLE_OBJECT"),
    Literal("INVALID_HANDSHAKE"),
    Literal("INVALID_TX_OUTPOINT"),
    Literal("INVALID_TX_SIGNATURE"),
    Literal("INVALID_TX_CONSERVATION"),
    Literal("INVALID_BLOCK_COINBASE"),
    Literal("INVALID_BLOCK_TIMESTAMP"),
    Literal("INVALID_BLOCK_POW"),
    Literal("INVALID_GENESIS")
  ),
});

export type ErrorMessageType = Static<typeof ErrorMessage>;

export const PeersMessage = Record({
  type: Literal("peers"),
  peers: Array(String),
});
export type PeersMessageType = Static<typeof PeersMessage>;

export const GetPeersMessage = Record({
  type: Literal("getpeers"),
});
export type GetPeersMessageType = Static<typeof GetPeersMessage>;

export const IHaveObjectMessage = Record({
  type: Literal("ihaveobject"),
  objectid: String,
});
export type IHaveObjectMessageType = Static<typeof IHaveObjectMessage>;

export const GetObjectMessage = Record({
  type: Literal("getobject"),
  objectid: String,
});
export type GetObjectMessageType = Static<typeof GetObjectMessage>;

export const ObjectMessage = Record({
  type: Literal("object"),
  object: Unknown,
});
export type ObjectMessageType = Static<typeof ObjectMessage>;

export const GetChainTipMessage = Record({
  type: Literal("getchaintip"),
});
export type GetChainTipMessageType = Static<typeof GetChainTipMessage>;

export const ChainTipMessage = Record({
  type: Literal("chaintip"),
  blockid: String,
});
export type ChainTipMessageType = Static<typeof ChainTipMessage>;

export const GetMemPoolMessage = Record({
  type: Literal("getmempool"),
});
export type GetMemPoolMessageType = Static<typeof GetMemPoolMessage>;

export const MemPoolMessage = Record({
  type: Literal("mempool"),
  txids: Array(String),
});
export type MemPoolMessageType = Static<typeof MemPoolMessage>;

export const Messages = [
  HelloMessage,
  PeersMessage,
  GetPeersMessage,
  ErrorMessage,
  IHaveObjectMessage,
  GetObjectMessage,
  ObjectMessage,
  GetChainTipMessage,
  ChainTipMessage,
  GetMemPoolMessage,
  MemPoolMessage,
];

export const Message = Union(
  HelloMessage,
  PeersMessage,
  GetPeersMessage,
  ErrorMessage,
  IHaveObjectMessage,
  GetObjectMessage,
  ObjectMessage,
  GetChainTipMessage,
  ChainTipMessage,
  GetMemPoolMessage,
  MemPoolMessage
);

export type MessageType = Static<typeof Message>;
