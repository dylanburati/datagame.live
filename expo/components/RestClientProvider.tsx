import React, { useState } from 'react';
import { RestClient } from '../helpers/api';
import { AsyncStorageLogger } from '../helpers/logging';

export type RestClientContextType = {
  client: RestClient;
  logger: AsyncStorageLogger;
};

export const RestClientContext = React.createContext<RestClientContextType>(
  null as any
);

export function RestClientProvider({ children }: React.PropsWithChildren<{}>) {
  const [client] = useState(() => new RestClient(new AsyncStorageLogger()));
  return (
    <RestClientContext.Provider value={{ client, logger: client.logger }}>
      {children}
    </RestClientContext.Provider>
  );
}
