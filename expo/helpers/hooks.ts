import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
} from 'react';
import { Animated } from 'react-native';
import { Presence } from 'phoenix';
import { SocketContext } from '../components/SocketProvider';
import { RestClientContext } from '../components/RestClientProvider';
import config from '../config';

export function useAnimatedValue(initialValue: number) {
  return useRef(new Animated.Value(initialValue)).current;
}

export type FieldReference<T> = {
  get: () => T;
  equals: (other: unknown) => boolean;
  set: (val: T) => void;
};

export function useReference<T>(initialValue: T): FieldReference<T> {
  const ref = useRef(initialValue);
  const value = useMemo(
    () => ({
      get: () => ref.current,
      equals: (other: unknown) => ref.current === other,
      set: (val: T) => {
        ref.current = val;
      },
    }),
    [ref]
  );
  return value;
}

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

type Comparator<T> = (a: T, b: T) => boolean;

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

export type ChannelHookArgs<TState, TAction> = {
  topic: string;
  disable: boolean;
  joinParams:
    | Record<string, unknown>
    | ((state: TState) => Record<string, unknown>);
  reducer: React.Reducer<TState, TAction>;
  initialState: TState;
};

export type ChannelHook<TSend extends HasEvent, TState> = {
  state: TState;
  connected: boolean;
  loading: boolean;
  error?: string;
  broadcast: SendFunc<TSend>;
};

export function useChannel<
  TSend extends HasEvent,
  TState,
  TAction extends HasEvent
>(params: ChannelHookArgs<TState, TAction>): ChannelHook<TSend, TState> {
  const { logger } = useContext(RestClientContext);
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
        logger.info({ received: 'room.message', event, payload });
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
    const func: SendFunc<TSend> = ({ event, ...payload }, catcher) => {
      logger.info({ called: 'room.broadcast', event, payload });
      channel
        .push(event, payload)
        .receive('ok', (reply) => {
          logger.info({ received: 'room.broadcast:ok', event, reply });
          dispatch({ event: `reply:${event}`, ...reply });
        })
        .receive('error', (err) => {
          logger.error({ received: 'room.broadcast:error', event, err });
          catcher && catcher(err.reason);
        })
        .receive('timeout', () => {
          logger.error({ received: 'room.broadcast:timeout', event });
          catcher && catcher('Timeout');
        });
    };
    logger.info({ called: 'room.join', payload: paramObj });
    channel
      .join()
      .receive('ok', (reply) => {
        if (!cancel) {
          logger.info({ received: 'room.join:ok', reply });
          dispatch({ event: 'reply:join', ...reply });
          setLoading(false);
          setBroadcast(() => func);
        }
      })
      .receive('error', (err) => {
        if (!cancel) {
          logger.error({ received: 'room.join:error', err });
          setLoading(false);
          setError(err.reason);
        }
      })
      .receive('timeout', () => {
        if (!cancel) {
          logger.error({ received: 'room.join:timeout' });
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
