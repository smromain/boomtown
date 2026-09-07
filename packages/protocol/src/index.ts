// @boomtown/protocol — the application wire contract shared by the desktop
// client and the PartyKit room object (KTD6). PartyKit owns the socket frame;
// this package owns the JSON payloads.

export { PROTOCOL_VERSION } from './version.js';

export {
  type ProtocolErrorCode,
  type ProtocolError,
  type WireEngineError,
  type WireError,
  protocolError,
  wireEngineError,
} from './errors.js';

export type {
  PlayerViewDTO,
  EngineEventDTO,
  ClientViewDTO,
  HandTile,
  HandTileEffect,
} from './dto.js';

export type {
  ClientMessage,
  RoomMessage,
  WireMessage,
  Hello,
  CreateRoom,
  JoinRoom,
  StartGame,
  SendCommand,
  Welcome,
  RoomStateMessage,
  Update,
  ErrorMessage,
  RoomConfig,
  SeatSlot,
  RoomState,
} from './messages.js';
