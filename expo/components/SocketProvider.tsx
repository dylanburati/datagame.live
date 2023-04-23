import React, { useContext, useEffect, useMemo, useRef } from 'react';
import { Socket } from 'phoenix';
import { RestClientContext } from './RestClientProvider';

export const SocketContext = React.createContext<Socket>(null as any);

export type SocketProviderProps = {
  wsUrl: string;
};

export const SocketProvider = ({
  wsUrl,
  children,
}: React.PropsWithChildren<SocketProviderProps>) => {
  const { logger } = useContext(RestClientContext);
  const logs = useRef<any[]>([]);
  const socket = useMemo(
    () =>
      new Socket(wsUrl, {
        logger: (kind, message, data) => {
          logs.current.push({ kind, message, data });
          if (kind === 'transport') {
            logger.info({ kind: `socket:${kind}`, message, data });
          }
        },
        transport: WebSocket,
        heartbeatIntervalMs: 1000,
      }),
    [logger, wsUrl]
  );

  useEffect(() => {
    socket.connect();
  }, [socket, wsUrl]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
