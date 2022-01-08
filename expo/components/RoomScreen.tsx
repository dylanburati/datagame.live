import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SwipeablePanel } from 'rn-swipeable-panel';
import { SwipeUpHandle } from './SwipeUpHandle';
import { RoomCreatorControls } from './RoomCreatorControls';
import { RoomLobbyControls } from './RoomLobbyControls';
import { RoomLeaderboard } from './RoomLeaderboard';
import { TriviaView } from './TriviaView';
import { TriviaContainer } from './TriviaContainer';
import { useRouteTyped } from '../helpers/navigation';
import {
  allCorrect,
  canAnswerTrivia,
  feedbackFor,
  isFeedbackStage,
  RoomPlayerList,
  RoomStage,
  RoomState,
  shouldShowLobby,
  shouldShowTrivia,
  triviaRequiredAnswers,
} from '../helpers/nplayerLogic';
import { useChannel, useStateNoCmp } from '../helpers/hooks';
import { roomStorageKey, storeJson } from '../helpers/storage';
import { RoomIncomingMessage, RoomOutgoingMessage } from '../helpers/api';
import { OrderedSet } from '../helpers/data';
import { styles } from '../styles';

function roomReducer(state: RoomState, message: RoomIncomingMessage) {
  if (message.event === 'join') {
    const { roundMessages, users, ...room } = message;
    storeJson(roomStorageKey(state.roomId), room);
    const withRoom: RoomState = {
      ...state,
      creatorId: message.creatorId,
      createdAt: message.createdAt,
      selfId: message.userId,
      selfName: message.displayName,
      players: state.players.upsert(message.userId, message.displayName, true),
    };
    const withUsers: RoomState = users.reduce(
      (acc, user) =>
        roomReducer(acc, { event: 'user:new', isNow: false, ...user }),
      withRoom
    );
    const withRound: RoomState = roundMessages.reduce(
      (acc, msg) => roomReducer(acc, msg),
      withUsers
    );
    return withRound;
  }
  if (message.event === 'user:new') {
    return {
      ...state,
      players: state.players.upsert(
        message.userId,
        message.displayName,
        message.isNow ? true : null
      ),
    };
  }
  if (message.event === 'user:change') {
    if (message.userId === state.selfId) {
      storeJson(roomStorageKey(state.roomId), message);
    }
    return {
      ...state,
      selfName:
        message.userId === state.selfId ? message.displayName : state.selfName,
      players: state.players.upsert(message.userId, message.displayName, true),
    };
  }
  if (message.event === 'presence') {
    return {
      ...state,
      players: state.players.updatePresences(message.presence),
    };
  }
  if (message.event === 'round:start') {
    return {
      ...state,
      stage:
        state.selfId != null && message.playerOrder.includes(state.selfId)
          ? RoomStage.UNKNOWN_TURN
          : RoomStage.WAITING_ROOM,
      players: state.players.setOrder(message.playerOrder),
      turnId: 0,
    };
  }
  if (state.stage === RoomStage.WAITING_ROOM) {
    return state;
  }
  if (message.event === 'turn:start') {
    state.receivedAnswers.clear();
    return {
      ...state,
      stage:
        message.userId === state.selfId
          ? RoomStage.SELF_TURN
          : message.participantId === state.selfId
          ? RoomStage.PARTICIPANT
          : RoomStage.SPECTATOR,
      trivia: message.trivia,
      turnId: message.turnId,
      participantId: message.participantId,
      players: state.players.startTurn(message.userId),
    };
  }
  if (message.event === 'turn:feedback') {
    state.receivedAnswers.set(message.userId, message.answered);
    if (state.receivedAnswers.size >= triviaRequiredAnswers(state)) {
      return {
        ...state,
        stage: feedbackFor(state.stage),
      };
    } else {
      return state;
    }
  }
  if (message.event === 'turn:end') {
    return {
      ...state,
      stage: RoomStage.UNKNOWN_TURN,
      players: state.players
        .endTurn(message.userId)
        .updateScores(message.scores),
      turnId: message.turnId,
    };
  }

  return state;
}

export function RoomScreen() {
  const {
    params: { roomId, savedSession },
  } = useRouteTyped<'Room'>();
  const [isModifyingRoom, setModifyingRoom] = useState(false);
  const [nameOnJoin, setNameOnJoin] = useState('');
  const [renameError, setRenameError] = useState<[string, string]>();
  const [triviaAnswers, setTriviaAnswers] = useStateNoCmp(
    new OrderedSet<number>()
  );
  const [isPanelActive, setPanelActive] = useState(false);

  const room = useChannel<RoomOutgoingMessage, RoomState, RoomIncomingMessage>({
    topic: `room:${roomId}`,
    joinParams: (state) => {
      if (state.selfId != null) {
        return { userId: state.selfId, displayName: state.selfName };
      }
      return { displayName: nameOnJoin };
    },
    disable: !nameOnJoin && !savedSession,
    reducer: roomReducer,
    initialState: {
      roomId,
      selfId: savedSession?.userId,
      selfName: savedSession?.displayName,
      stage: RoomStage.LOBBY,
      players: new RoomPlayerList([]),
      turnId: -1,
      receivedAnswers: new Map(),
    },
  });

  useEffect(() => {
    if (room.state.selfId === undefined) {
      return;
    }
    if (room.state.stage !== RoomStage.UNKNOWN_TURN) {
      return;
    }
    const turnsToWait = room.state.players.turnsUntil(room.state.selfId);
    if (turnsToWait < 0) {
      return;
    }
    let waitMs = turnsToWait * 10000;
    const timeout = setTimeout(() => {
      room.broadcast(
        { event: 'turn:start', fromTurnId: room.state.turnId },
        console.error
      );
    }, waitMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [room, room.state]);

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

  useEffect(() => {
    if (room.state.trivia) {
      // answers could have been entered in another session
      const answersLost =
        room.state.stage === RoomStage.FEEDBACK_SELF_TURN &&
        triviaAnswers.isEmpty();
      if (room.state.stage === RoomStage.FEEDBACK_SPECTATOR || answersLost) {
        const feedbackAns = room.state.receivedAnswers.get(
          room.state.players.activeId ?? -1
        );
        if (feedbackAns) {
          setTriviaAnswers(triviaAnswers.clear().extend(feedbackAns));
        }
      } else if (!isFeedbackStage(room.state.stage)) {
        setTriviaAnswers(triviaAnswers.clear());
      }
    }
  }, [
    room.state.players,
    room.state.receivedAnswers,
    room.state.stage,
    room.state.trivia,
    setTriviaAnswers,
    triviaAnswers,
  ]);

  const doBegin = (playerOrder: number[]) => {
    setModifyingRoom(false);
    room.broadcast(
      {
        event: 'round:start',
        playerOrder,
        pointTarget: 5,
      },
      console.error
    );
  };

  const isCreator =
    room.state.selfId != null && room.state.selfId === room.state.creatorId;
  const doneAnswering =
    room.state.trivia && triviaAnswers.size >= room.state.trivia.minAnswers;

  const doAdvance = () => {
    if (room.state.selfId === undefined || !doneAnswering) {
      return;
    }
    if (canAnswerTrivia(room.state.stage)) {
      room.broadcast({
        event: 'turn:feedback',
        answered: triviaAnswers.toList(),
      });
    } else {
      const score = allCorrect(room.state, triviaAnswers) ? 1 : 0;
      const userIds = [room.state.selfId];
      if (room.state.participantId !== undefined) {
        userIds.push(room.state.participantId);
      }
      room.broadcast({
        event: 'turn:end',
        scoreChanges: userIds.map((userId) => ({
          userId,
          score,
        })),
      });
    }
  };
  return (
    <SafeAreaView style={styles.topContainer}>
      <ScrollView style={styles.flex1} keyboardShouldPersistTaps="handled">
        {shouldShowLobby(room.state.stage) && (
          <RoomLobbyControls
            roomState={room.state}
            roomError={room.error}
            renameError={renameError}
            connected={room.connected}
            doNameChange={doNameChange}
          />
        )}
        {isCreator &&
          (shouldShowLobby(room.state.stage) || isModifyingRoom) && (
            <RoomCreatorControls
              roomState={room.state}
              canCancel={isModifyingRoom}
              doCancel={() => setModifyingRoom(false)}
              doBegin={doBegin}
            />
          )}
        {room.state.stage === RoomStage.WAITING_ROOM && (
          <Text style={[styles.mt4, styles.textCenter]}>
            Ask the host to add you to the next round.
          </Text>
        )}
        {room.state.stage === RoomStage.UNKNOWN_TURN && (
          <Text style={[styles.mt4, styles.textCenter]}>
            Waiting for another player to start their turn.
          </Text>
        )}
        {shouldShowTrivia(room.state.stage) && (
          <TriviaContainer
            state={room.state}
            disabled={isModifyingRoom}
            style={[styles.mt4]}
          >
            <TriviaView
              state={room.state}
              triviaAnswers={triviaAnswers}
              onOptionPress={(index) =>
                setTriviaAnswers(
                  triviaAnswers
                    .toggle(index)
                    .takeRight(room.state.trivia?.maxAnswers ?? 0)
                )
              }
              doneAnswering={doneAnswering}
              doAdvance={doAdvance}
            />
          </TriviaContainer>
        )}
      </ScrollView>
      {!isPanelActive && shouldShowTrivia(room.state.stage) && (
        <SwipeUpHandle onSwipe={() => setPanelActive(true)}>
          <TouchableOpacity
            style={[
              styles.row,
              styles.centerAll,
              styles.bgGray300,
              styles.roundedTopLeftXl,
              styles.roundedTopRightXl,
            ]}
            activeOpacity={1}
            onLongPress={() => setPanelActive(true)}
          >
            <Text style={styles.p4}>▲ leaderboard ▲</Text>
          </TouchableOpacity>
        </SwipeUpHandle>
      )}
      {shouldShowTrivia(room.state.stage) && (
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
      )}
    </SafeAreaView>
  );
}
