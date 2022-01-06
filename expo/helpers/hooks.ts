import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
} from 'react';
import type { Comparator } from 'lodash';
import { Presence } from 'phoenix';
import { SocketContext } from '../components/SocketProvider';
import { LogPersist } from './storage';
import config from '../config';

export function useSet<T>(initialValue: Set<T>) {
  const set = useRef(initialValue).current;
  const [, setCounter] = useState(0);
  return {
    set,
    add: (item: T) => {
      const changed = !set.has(item);
      set.add(item);
      if (changed) {
        setCounter((n) => n + 1);
      }
    },
    clear: () => {
      const changed = set.size > 0;
      set.clear();
      if (changed) {
        setCounter((n) => n + 1);
      }
    },
  };
}

export function useStateNoCmp<T>(
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state2, setState2] = useState({
    state: initialValue,
  });
  const setState: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (update) => {
      let updater: (val: T) => T;
      if (typeof update === 'function') {
        updater = update as any;
      } else {
        updater = () => update;
      }
      setState2((val) => ({
        state: updater(val.state),
      }));
    },
    []
  );
  return [state2.state, setState];
}

// convenience so that objects/arrays don't have to be referentially stable
export function useMemoWithComparator<T>(state: T, comparator: Comparator<T>) {
  const history = useRef<T[]>([]).current;
  const prev = history.find((item) => comparator(item, state));
  if (!prev) {
    history.push(state);
    return state;
  }
  return prev;
}

type HasEvent = {
  event: string;
};

export type PresenceAction =
  | HasEvent
  | {
      event: 'presence';
      presence: Presence;
    };

export type SendFunc<T extends HasEvent> = (
  eventAndPayload: T,
  catcher?: (reason: string | undefined) => void
) => void;

export function useChannel<
  TSend extends HasEvent,
  TState,
  TAction extends HasEvent
>(params: {
  topic: string;
  disable: boolean;
  joinParams: object | ((state: TState) => object);
  reducer: React.Reducer<TState, TAction>;
  initialState: TState;
}) {
  const { topic, joinParams, disable, reducer, initialState } = params;
  const socket = useContext(SocketContext);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [broadcast, setBroadcast] = useState<SendFunc<TSend>>();
  const checkedBroadcast = useMemo(() => {
    if (broadcast) {
      return broadcast;
    }
    return () => {
      // console.error('The channel has not been connected');
    };
  }, [broadcast]);

  const userParams =
    typeof joinParams === 'function' ? joinParams(state) : joinParams;
  const paramObj = {
    ...userParams,
    version: config.ROOM_API_VERSION,
  };
  useEffect(() => {
    if (disable) {
      return;
    }
    const channel = socket.channel(topic, paramObj);
    const presence = new Presence(channel);
    channel.onMessage = (event, payload) => {
      if (!/^(phx|chan)_reply/.test(event)) {
        LogPersist.info({ received: 'room.message', event, payload });
        dispatch({
          event,
          ...payload,
        });
      }
      return payload;
    };
    presence.onSync(() => {
      dispatch({
        event: 'presence',
        presence,
      } as any);
    });

    let cancel = false;
    setLoading(true);
    setError(undefined);
    const func: SendFunc<HasEvent & object> = (
      { event, ...payload },
      catcher
    ) => {
      LogPersist.info({ called: 'room.broadcast', event, payload });
      channel
        .push(event, payload)
        .receive('ok', (reply) => {
          LogPersist.info({ received: 'room.broadcast:ok', event, reply });
          dispatch({ event: `reply:${event}`, ...reply });
        })
        .receive('error', (err) => {
          LogPersist.error({ received: 'room.broadcast:error', event, err });
          catcher && catcher(err.reason);
        })
        .receive('timeout', () => {
          LogPersist.error({ received: 'room.broadcast:timeout', event });
          catcher && catcher('Timeout');
        });
    };
    LogPersist.info({ called: 'room.join', payload: paramObj });
    channel
      .join()
      .receive('ok', (reply) => {
        if (!cancel) {
          LogPersist.info({ received: 'room.join:ok', reply });
          dispatch({ event: 'reply:join', ...reply });
          setLoading(false);
          setBroadcast(() => func);
        }
      })
      .receive('error', (err) => {
        if (!cancel) {
          LogPersist.error({ received: 'room.join:error', err });
          setLoading(false);
          setError(err.reason);
        }
      })
      .receive('timeout', () => {
        if (!cancel) {
          LogPersist.error({ received: 'room.join:timeout' });
          setError('Timeout');
        }
      });

    return () => {
      cancel = true;
      channel.leave();
      channel.onMessage = (_, payload) => payload;
      presence.onSync(() => {});
      setLoading(false);
    };
    // join params should be whatever is available at the time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, topic, disable]);

  return {
    state,
    connected: broadcast !== undefined,
    loading,
    error,
    broadcast: checkedBroadcast,
  };
}
