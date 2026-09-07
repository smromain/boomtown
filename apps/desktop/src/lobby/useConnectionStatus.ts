import { useEffect, useState } from 'react';
import type { LobbyError, SocketExtras } from '@boomtown/client-core';
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
