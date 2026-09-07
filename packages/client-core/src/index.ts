// @boomtown/client-core — client state layer and transport abstraction (KTD5).

export { GameSession, type SessionResult } from './session.js';
export {
  clientView,
  type ClientView,
  type HandTile,
  type HandTileEffect,
} from './view.js';
export type { GameTransport, TransportMessage } from './transport/types.js';
export {
  localTransport,
  type LocalTransportOptions,
  type LocalEngine,
} from './transport/local.js';
export {
  workerTransport,
  type EngineWorkerRequest,
  type EngineWorkerResponse,
} from './transport/worker.js';
export {
  type GameClientState,
  initialClientState,
  activeView,
  decidingSeat,
} from './store.js';
export { reconcile } from './reconcile.js';
export { createGameClient, type GameClient } from './dispatch.js';
export { attachBotDriver, type BotDriverOptions, type BotSeat } from './bots.js';
export {
  socketTransport,
  type SocketTransportOptions,
  type SocketExtras,
  type LobbyError,
} from './transport/socket.js';
