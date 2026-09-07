import { useEffect, useState } from 'react';
import type { SocketExtras } from '@boomtown/client-core';
import type { ConnectionStatus } from '../online/onlineGame.js';

/** Subscribe to a socket transport's connection status for the reconnect banner. */
export function useConnectionStatus(transport: SocketExtras): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  useEffect(() => {
    transport.onConnectionChange(setStatus);
  }, [transport]);
  return status;
}
