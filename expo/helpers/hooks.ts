import React, {
  useContext,
  useEffect,
  useRef,
  useReducer,
  useState,
  useMemo,
} from 'react';
import { addOrientationChangeListener } from 'expo-screen-orientation';
import { Dimensions } from 'react-native';
import { SocketContext } from '../components/SocketProvider';
import { Comparator } from 'lodash';

export function useWindowWidth() {
  const [width, setWidth] = useState(Dimensions.get('window').width);
  useEffect(() => {
    const subscription = addOrientationChangeListener(() => {
      const d = Dimensions.get('window');
      setWidth(d.width);
    });

    return () => {
      subscription.remove();
    };
  });

  return width;
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
  joinParams: object | ((state: TState) => object);
  disable: boolean;
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

  const paramObj =
    typeof joinParams === 'function' ? joinParams(state) : joinParams;
  useEffect(() => {
    if (disable) {
      return;
    }
    const channel = socket.channel(topic, paramObj);
    channel.onMessage = (event, payload) => {
      dispatch({
        event,
        ...payload,
      });
      return payload;
    };

    let cancel = false;
    setLoading(true);
    setError(undefined);
    channel
      .join()
      .receive('ok', (resp) => {
        if (!cancel) {
          dispatch({ event: 'reply:join', ...resp });
          console.log(`joined ${topic}`, resp);
          setLoading(false);
          setBroadcast(() => {
            const func: SendFunc<HasEvent & object> = (
              { event, ...payload },
              catcher
            ) => {
              channel
                .push(event, payload)
                .receive('ok', (reply) =>
                  dispatch({ event: `reply:${event}`, ...reply })
                )
                .receive('error', (err) => catcher && catcher(err.reason))
                .receive('timeout', () => catcher && catcher('Timeout'));
            };
            return func;
          });
        }
      })
      .receive('error', (resp) => {
        if (!cancel) {
          setLoading(false);
          setError(resp.reason);
        }
      })
      .receive('timeout', () => {
        if (!cancel) {
          setError('Timeout');
        }
      });

    return () => {
      cancel = true;
      channel.leave();
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
