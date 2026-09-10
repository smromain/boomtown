import { useEffect, useState } from 'react';
import type { LobbyError, SocketExtras } from '@boomtown/client-core';
import type { RoomState } from '@boomtown/protocol';
import type { ConnectionStatus } from '../online/onlineGame.js';

/** Subscribe to a socket transport's connection status for the reconnect banner. */
export function useConnectionStatus(transport: SocketExtras): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  useEffect(() => transport.onConnectionChange(setStatus), [transport]);
  return status;
}

/** The most recent lobby / room-level error (room-full, wrong-version, ...), or null. */
export function useLobbyError(transport: SocketExtras): LobbyError | null {
  const [error, setError] = useState<LobbyError | null>(null);
  useEffect(() => transport.onLobbyError(setError), [transport]);
  return error;
}

/**
 * The room's live `RoomState`, seeded from the transport rather than from null:
 * the first `room-state` lands before React mounts, and waiting for the next
 * one leaves the caller with nothing (the same trap `SeatList` documents).
 *
 * Used during play, not just in the lobby — it is what keeps seat names and
 * bot/human kinds authoritative on the play surface (#15).
 */
export function useRoomState(transport: SocketExtras): RoomState | null {
  const [state, setState] = useState<RoomState | null>(() => transport.roomState());
  useEffect(() => transport.onRoomState(setState), [transport]);
  return state;
}
