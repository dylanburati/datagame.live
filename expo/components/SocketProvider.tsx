import React, { useEffect, useMemo } from 'react';
import { Socket } from 'phoenix';

export const SocketContext = React.createContext<Socket>(null as any);

export type SocketProviderProps = {
  wsUrl: string;
};

export const SocketProvider = ({
  wsUrl,
  children,
}: React.PropsWithChildren<SocketProviderProps>) => {
  const socket = useMemo(
    () =>
      new Socket(wsUrl, {
        transport: WebSocket,
        heartbeatIntervalMs: 1000,
      }),
    [wsUrl]
  );

  useEffect(() => {
    socket.connect();
  }, [socket, wsUrl]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
