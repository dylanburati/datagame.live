/* eslint-disable @typescript-eslint/no-unused-vars */
import React, {
  useState,
  useEffect,
  useContext,
  useReducer,
  useCallback,
} from 'react';
import { SafeAreaView, ScrollView } from 'react-native';
import { RoomCreatorControls } from './RoomCreatorControls';
import { RoomLobbyControls } from './RoomLobbyControls';
import { TriviaView } from './TriviaView';
import { TriviaContainer } from './TriviaContainer';
import { useRouteTyped } from '../helpers/navigation';
import {
  RoomPlayerList,
  RoomPhase,
  RoomState,
  triviaIsPresent,
  ROOM_PHASE_LABELS,
} from '../helpers/nplayerLogic';
import { ChannelHook, useChannel, useStateNoCmp } from '../helpers/hooks';
import { roomStorageKey, storeJson } from '../helpers/storage';
import { RoomIncomingMessage, RoomOutgoingMessage } from '../helpers/api';
import { OrderedSet } from '../helpers/data';
import { styles } from '../styles';
import { hangmanEvents } from '../tests/hangmanEvents';
import { RoomStatusBar } from './RoomStatusBar';
import { RestClientContext } from './RestClientProvider';

function roomReducer(
  state: RoomState,
  message: RoomIncomingMessage
): RoomState {
  if (message.event === 'clock') {
    return {
      ...state,
      clockDiffMs: Date.now() - message.timestamp,
    };
  }
  if (message.event === 'join') {
    const { roundMessages, users, ...room } = message;
    storeJson(roomStorageKey(state.roomId), room);
    const withRoom: RoomState = {
      roomId: state.roomId,
      clockDiffMs: state.clockDiffMs,
      phase: RoomPhase.LOBBY,
      creatorId: message.creatorId,
      createdAt: message.createdAt,
      selfId: message.userId,
      selfName: message.displayName,
      players: new RoomPlayerList([]).upsert(
        message.userId,
        message.displayName,
        true
      ),
    };
    const withUsers: RoomState = users.reduce(
      (acc: RoomState, user) =>
        roomReducer(acc, { event: 'user:change', ...user }),
      withRoom
    );
    const withRound: RoomState = roundMessages.reduce(
      (acc, msg) => roomReducer(acc, msg),
      withUsers
    );
    return withRound;
  }
  if (state.phase === RoomPhase.NOT_REGISTERED) {
    // TODO should error
    return state;
  }
  if (message.event === 'user:change') {
    if (message.userId === state.selfId) {
      storeJson(roomStorageKey(state.roomId), message);
    }
    return {
      ...state,
      selfName:
        message.userId === state.selfId ? message.displayName : state.selfName,
      players: state.players.upsert(
        message.userId,
        message.displayName,
        message.isPresent
      ),
    };
  }
  if (message.event === 'turn:start') {
    return {
      ...state,
      phase: RoomPhase.QUESTION,
      trivia: message.trivia,
      turnId: message.turnId,
      deadline: message.deadline + state.clockDiffMs,
      durationMillis: message.durationMillis,
      participantId: message.participantId,
      receivedAnswers: new Map(),
    };
  }
  if (message.event === 'turn:progress') {
    if (
      state.phase !== RoomPhase.QUESTION &&
      state.phase !== RoomPhase.DIRECT_FEEDBACK
    ) {
      return state;
    }
    return {
      ...state,
      players: state.players.updateScores(message.scores, message.turnId),
    };
  }
  if (message.event === 'turn:feedback') {
    if (
      state.phase !== RoomPhase.QUESTION &&
      state.phase !== RoomPhase.DIRECT_FEEDBACK
    ) {
      // TODO should error
      return state;
    }
    message.answers.forEach(({ userId, answered }) => {
      state.receivedAnswers.set(userId, answered);
    });
    return {
      ...state,
      phase: message.isFinal
        ? RoomPhase.ROOM_FEEDBACK
        : RoomPhase.DIRECT_FEEDBACK,
      expectedAnswers: message.expectedAnswers,
      statAnnotation: message?.statAnnotation,
      deadline: message.isFinal
        ? message.deadline + state.clockDiffMs
        : state.deadline,
      durationMillis: message.isFinal
        ? message.durationMillis
        : state.durationMillis,
      players: state.players.updateScores(message.scores, message.turnId),
    };
  }

  return state;
}

export function RoomScreen() {
  const {
    params: { roomId, savedSession },
  } = useRouteTyped<'Room'>();
  const { logger } = useContext(RestClientContext);
  const [isModifyingRoom, setModifyingRoom] = useState(false);
  const [nameOnJoin, setNameOnJoin] = useState('');
  const [renameError, setRenameError] = useState<[string, string]>();
  const [triviaAnswerState, setTriviaAnswerState] = useState({
    turnId: -1,
    answers: OrderedSet.empty<number>(),
  });
  const setTriviaAnswers = useCallback(
    (answers: OrderedSet<number>) =>
      setTriviaAnswerState((val) => ({ turnId: val.turnId, answers })),
    []
  );
  // const [isPanelActive, setPanelActive] = useState(false);

  const initialState: RoomState = {
    roomId,
    clockDiffMs: 0,
    phase: RoomPhase.NOT_REGISTERED,
  };
  const room = useChannel<RoomOutgoingMessage, RoomState, RoomIncomingMessage>({
    topic: `room:${roomId}`,
    joinParams: (_state) => {
      if (savedSession != null) {
        return {
          userId: savedSession.userId,
          displayName: savedSession.displayName,
        };
      }
      return { displayName: nameOnJoin };
    },
    disable: !nameOnJoin && !savedSession,
    reducer: (s, a) => {
      // TODO FIX!!!
      const s2 = roomReducer(s, a);
      logger.info([s, a, s2]);
      const transition = [
        a.event,
        ROOM_PHASE_LABELS[s.phase],
        ROOM_PHASE_LABELS[s2.phase],
      ];
      console.log(`[${transition.join(', ')}]`);
      return s2;
    },
    initialState,
  });
  // const [room, mockEvent] = useReducer(
  //   (
  //     { state, ...rest }: ChannelHook<any, RoomState>,
  //     action: RoomIncomingMessage
  //   ): ChannelHook<any, RoomState> => ({
  //     state: roomReducer(state, action),
  //     ...rest,
  //   }),
  //   {
  //     connected: true,
  //     loading: false,
  //     broadcast: (evt) => {
  //       console.log(evt);
  //     },
  //     error: undefined,
  //     state: initialState,
  //   }
  // );
  // useEffect(() => {
  //   hangmanEvents.forEach((evt) => mockEvent(evt));
  // }, [mockEvent]);

  const doNameChange = (name: string) => {
    if (!room.connected) {
      setNameOnJoin(name);
    } else {
      room.broadcast({ event: 'user:change', displayName: name }, (errorMsg) =>
        setRenameError([name, errorMsg ?? 'Unknown error'])
      );
    }
  };

  useEffect(() => {
    if (room.error) {
      setNameOnJoin('');
    }
  }, [room.error]);

  const turnId = triviaIsPresent(room.state) ? room.state.turnId : -1;
  const prefilled = triviaIsPresent(room.state)
    ? room.state.trivia.prefilledAnswers
    : undefined;
  useEffect(() => {
    if (triviaAnswerState.turnId !== turnId) {
      setTriviaAnswerState({
        turnId,
        answers: triviaAnswerState.answers
          .clear()
          .extend((prefilled || []).map((e) => e.id)),
      });
    }
  }, [prefilled, setTriviaAnswers, triviaAnswerState, turnId]);
  const triviaAnswers =
    triviaAnswerState.turnId === turnId
      ? triviaAnswerState.answers
      : OrderedSet.empty<number>();

  const doBegin = (_playerOrder: number[]) => {
    setModifyingRoom(false);
    room.broadcast(
      {
        event: 'round:start',
      },
      console.error
    );
  };

  const isCreator =
    room.state.phase !== RoomPhase.NOT_REGISTERED &&
    room.state.selfId === room.state.creatorId;

  const doAdvance = () => {
    if (room.state.phase === RoomPhase.QUESTION) {
      room.broadcast({
        event: 'turn:feedback',
        turnId: room.state.turnId,
        answered: triviaAnswerState.answers.toList(),
      });
    } else if (room.state.phase === RoomPhase.ROOM_FEEDBACK) {
      room.broadcast({
        event: 'turn:end',
        fromTurnId: room.state.turnId,
      });
    }
  };

  return (
    <SafeAreaView style={styles.topContainer}>
      <RoomStatusBar room={room} />
      <ScrollView style={styles.flex1} keyboardShouldPersistTaps="handled">
        {(room.state.phase === RoomPhase.LOBBY ||
          room.state.phase === RoomPhase.NOT_REGISTERED) && (
          <RoomLobbyControls
            roomState={room.state}
            roomError={room.error}
            renameError={renameError}
            connected={room.connected}
            doNameChange={doNameChange}
          />
        )}
        {isCreator &&
          (room.state.phase === RoomPhase.LOBBY || isModifyingRoom) && (
            <RoomCreatorControls
              roomState={room.state}
              canCancel={isModifyingRoom}
              doCancel={() => setModifyingRoom(false)}
              doBegin={doBegin}
            />
          )}
        {/* {room.state.phase === RoomPhase.WAITING_ROOM && (
          <Text style={[styles.mt4, styles.textCenter]}>
            Ask the host to add you to the next round.
          </Text>
        )}
        {room.state.phase === RoomPhase.UNKNOWN_TURN && (
          <Text style={[styles.mt4, styles.textCenter]}>
            Waiting for another player to start their turn.
          </Text>
        )} */}
        {triviaIsPresent(room.state) && (
          <TriviaContainer
            state={room.state}
            disabled={isModifyingRoom}
            style={[styles.mt4]}
          >
            <TriviaView
              state={room.state}
              triviaAnswers={triviaAnswers}
              setTriviaAnswers={setTriviaAnswers}
              doAdvance={doAdvance}
            />
          </TriviaContainer>
        )}
      </ScrollView>
      {/* {!isPanelActive && shouldShowBottomPanel(room.state.phase) && (
        <SwipeUpHandle onSwipe={() => setPanelActive(true)}>
          <TouchableOpacity
            style={[
              styles.row,
              styles.centerAll,
              styles.bgGray300,
              styles.roundedTopLeftXl,
              styles.roundedTopRightXl,
            ]}
            activeOpacity={0.5}
            onLongPress={() => setPanelActive(true)}
          >
            <Text style={styles.p4}>▲ leaderboard ▲</Text>
          </TouchableOpacity>
        </SwipeUpHandle>
      )}
      {shouldShowBottomPanel(room.state.phase) && (
        <SwipeablePanel
          fullWidth={true}
          onlySmall={true}
          isActive={isPanelActive}
          showCloseButton={true}
          style={[styles.swipeablePanel]}
          onClose={() => setPanelActive(false)}
        >
          <Text
            style={[styles.textMd, styles.textCenter, styles.mt2, styles.mx6]}
          >
            {roomId}
          </Text>
          <RoomLeaderboard
            selfId={room.state.selfId}
            players={room.state.players}
          />
          {isCreator && (
            <View style={[styles.centerAll, styles.mt8]}>
              <TouchableOpacity
                style={[
                  styles.bgBlack,
                  styles.roundedLg,
                  styles.px4,
                  styles.py2,
                ]}
                onPress={() => {
                  setPanelActive(false);
                  setModifyingRoom(true);
                }}
              >
                <Text style={[styles.textWhite, styles.textCenter]}>
                  NEW ROUND
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </SwipeablePanel>
      )} */}
    </SafeAreaView>
  );
}
