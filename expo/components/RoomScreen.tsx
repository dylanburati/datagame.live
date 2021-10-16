import React, { useState, useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { RoomCreatorControls } from './RoomCreatorControls';
import { ChipPicker } from './ChipPicker';
import { RoomLobbyControls } from './RoomLobbyControls';
import { useRouteTyped } from '../helpers/navigation';
import {
  RoomPlayerList,
  RoomStage,
  RoomState,
  shouldShowTrivia,
} from '../helpers/nplayerLogic';
import { useChannel, useStateNoCmp } from '../helpers/hooks';
import { roomStorageKey, storeJson } from '../helpers/storage';
import { RoomIncomingMessage, RoomOutgoingMessage } from '../helpers/api';
import { OrderedSet } from '../helpers/data';
import { styles } from '../styles';

function roomReducer(state: RoomState, message: RoomIncomingMessage) {
  if (message.event === 'join') {
    storeJson(roomStorageKey(state.roomId), message);
    return {
      ...state,
      creatorId: message.creatorId,
      createdAt: message.createdAt,
      selfId: message.userId,
      selfName: message.displayName,
      players: state.players.upsert(message.userId, message.displayName, true),
    };
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
      stage: RoomStage.UNKNOWN_TURN,
      players: state.players.setOrder(message.playerOrder),
      turnId: message.turnId,
    };
  }
  if (message.event === 'turn:start') {
    const currentPlayer = state.players.array.find(
      (pl) => pl.id === message.userId
    );
    return {
      ...state,
      stage:
        message.userId === state.selfId
          ? RoomStage.SELF_TURN
          : RoomStage.SPECTATOR,
      trivia: message.trivia,
      turnId: message.turnId,
      currentPlayerName: currentPlayer?.name,
    };
  }
  if (message.event === 'turn:end') {
    return {
      ...state,
      stage: RoomStage.UNKNOWN_TURN,
      players: state.players.appendTurn(message.userId),
    };
  }

  return state;
}

export function RoomScreen() {
  const {
    params: { roomId, savedSession },
  } = useRouteTyped<'Room'>();
  const [nameOnJoin, setNameOnJoin] = useState('');
  const [renameError, setRenameError] = useState<[string, string]>();
  const [triviaAnswers, setTriviaAnswers] = useStateNoCmp(
    new OrderedSet<number>()
  );

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
    const timeout = setTimeout(() => {
      room.broadcast(
        { event: 'turn:start', fromTurnId: room.state.turnId },
        console.error
      );
    }, turnsToWait * 10000);

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
      setTriviaAnswers(triviaAnswers.clear());
    }
  }, [room.state.trivia, setTriviaAnswers, triviaAnswers]);

  const doBegin = (playerOrder: number[]) => {
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

  return (
    <View style={styles.topContainer}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {room.state.stage === RoomStage.LOBBY && (
          <RoomLobbyControls
            roomState={room.state}
            roomError={room.error}
            renameError={renameError}
            connected={room.connected}
            doNameChange={doNameChange}
          />
        )}
        {isCreator && room.state.stage === RoomStage.LOBBY && (
          <RoomCreatorControls doBegin={doBegin} roomState={room.state} />
        )}
        {room.state.stage === RoomStage.UNKNOWN_TURN && (
          <Text style={[styles.mt4, styles.textCenter]}>
            Waiting for another player to start their turn.
          </Text>
        )}
        {shouldShowTrivia(room.state.stage) && room.state.trivia && (
          <>
            <Text style={[styles.mt4, styles.textCenter]}>
              {room.state.trivia.question}
            </Text>
            <ChipPicker
              style={[
                styles.mt4,
                styles.mx6,
                styles.startAll,
                styles.flexCol,
                styles.itemsStretch,
              ]}
              data={room.state.trivia.options}
              chipStyle={({ index }) => [
                styles.py2,
                styles.pr4,
                styles.roundedLg,
                styles.mt2,
                triviaAnswers.has(index)
                  ? [styles.bgPurple300, styles.borderPurpleAccent]
                  : [styles.bgPaperDarker],
              ]}
              onPress={({ index }) =>
                setTriviaAnswers(
                  triviaAnswers
                    .toggle(index)
                    .takeRight(room.state.trivia?.maxAnswers ?? 0)
                )
              }
            >
              {({ item, index }) => (
                <>
                  <Text style={[styles.textMd, styles.fontWeightBold]}>
                    {item.answer}
                  </Text>
                  {triviaAnswers.has(index) &&
                    room.state.trivia?.answerType === 'poprank' && (
                      <View
                        style={[styles.absolute, styles.right0, styles.mr2]}
                      >
                        <Text>{index + 1}</Text>
                      </View>
                    )}
                </>
              )}
            </ChipPicker>
            {room.state.stage === RoomStage.SELF_TURN && (
              <TouchableOpacity
                style={[
                  styles.bgGreen,
                  styles.roundedLg,
                  styles.flexGrow,
                  styles.mt8,
                  styles.mx6,
                  styles.p4,
                ]}
                onPress={() => room.broadcast({ event: 'turn:end' })}
              >
                <Text style={[styles.textWhite, styles.textCenter]}>
                  SUBMIT
                </Text>
              </TouchableOpacity>
            )}
            {room.state.stage === RoomStage.SPECTATOR && (
              <Text style={[styles.textCenter, styles.mt8]}>
                ({room.state.currentPlayerName ?? "Other player's"} turn)
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
