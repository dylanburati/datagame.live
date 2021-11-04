import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ViewProps,
} from 'react-native';
import { FormattedDate, FormattedNumber } from 'react-intl';
import { SwipeablePanel } from 'rn-swipeable-panel';
import { SwipeUpHandle } from './SwipeUpHandle';
import { RoomCreatorControls } from './RoomCreatorControls';
import { ChipPicker } from './ChipPicker';
import { RoomLobbyControls } from './RoomLobbyControls';
import { GridLayout } from './GridLayout';
import { useRouteTyped } from '../helpers/navigation';
import {
  allCorrect,
  canAnswerTrivia,
  getOptionStyles,
  RoomPlayerList,
  RoomStage,
  RoomState,
  shouldShowAdvanceButton,
  shouldShowTrivia,
  statToNumber,
} from '../helpers/nplayerLogic';
import { useChannel, useStateNoCmp } from '../helpers/hooks';
import { roomStorageKey, storeJson } from '../helpers/storage';
import {
  RoomIncomingMessage,
  RoomOutgoingMessage,
  Trivia,
  TriviaOption,
} from '../helpers/api';
import { OrderedSet } from '../helpers/data';
import { styleConfig, styles } from '../styles';

type StatDisplayProps = {
  trivia: Trivia;
  option: TriviaOption;
};

function StatDisplay({ trivia, option }: StatDisplayProps) {
  const { statDef } = trivia;
  const numValue = statToNumber(statDef, option.questionValue);
  if (statDef && !Number.isNaN(numValue)) {
    switch (statDef.type) {
      case 'number':
        return <FormattedNumber value={numValue} />;
      case 'dollar_amount':
        return (
          <FormattedNumber style="currency" currency="USD" value={numValue} />
        );
      case 'date':
        return <FormattedDate value={numValue} year="numeric" month="long" />;
    }
  }
  const array = Array.isArray(option.questionValue)
    ? option.questionValue
    : [option.questionValue];
  const commaList =
    array.slice(0, 2).join(', ') + (array.length > 2 ? '...' : '');
  return <>{commaList}</>;
}

type TriviaContainerProps = {
  state: RoomState;
  style: ViewProps['style'];
};

function TriviaContainer({
  state,
  style,
  children,
}: React.PropsWithChildren<TriviaContainerProps>) {
  const selfTurn = state.players.activeId === state.selfId;
  const whoseTurn = selfTurn ? 'You' : `${state.players.activeName ?? '???'}`;

  return (
    <View style={style}>
      <View style={[styles.row, styles.itemsBaseline, styles.justifyCenter]}>
        <Text style={[styles.textLg]}>{whoseTurn}</Text>
        <Text style={[styles.ml2]}>
          (P{state.players.startedPlayerIndex + 1})
        </Text>
      </View>
      {selfTurn ? (
        <>{children}</>
      ) : (
        <View
          style={[
            styles.m4,
            styles.pt2,
            styles.pb8,
            styles.zMinusTwo,
            styles.bgPaperDarker,
            styles.roundedLg,
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}

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
      players: state.players
        .setOrder(message.playerOrder)
        .endTurn(message.lastTurnUserId ?? -1)
        .updateScores(message.scores ?? []),
      turnId: message.turnId,
    };
  }
  if (message.event === 'turn:start') {
    return {
      ...state,
      stage:
        message.userId === state.selfId
          ? RoomStage.SELF_TURN
          : RoomStage.SPECTATOR,
      trivia: message.trivia,
      turnId: message.turnId,
      players: state.players.startTurn(message.userId),
      receivedAnswers: undefined,
    };
  }
  if (message.event === 'turn:feedback') {
    return {
      ...state,
      stage: RoomStage.FEEDBACK,
      // TODO send most recent turn start in after_join
      // players: state.players.startTurn(message.userId),
      receivedAnswers:
        message.turnId === state.turnId
          ? message.answered
          : state.receivedAnswers,
    };
  }
  if (message.event === 'turn:end') {
    return {
      ...state,
      stage: RoomStage.UNKNOWN_TURN,
      players: state.players
        .endTurn(message.userId)
        .updateScores(message.scoreChanges),
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
    if (!room.state.trivia) {
      room.broadcast({ event: 'replay:turn:start' });
      waitMs = Math.max(waitMs, 2000);
    }
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
      if (room.state.receivedAnswers) {
        setTriviaAnswers(
          triviaAnswers.clear().extend(room.state.receivedAnswers)
        );
      } else {
        setTriviaAnswers(triviaAnswers.clear());
      }
    }
  }, [
    room.state.receivedAnswers,
    room.state.trivia,
    setTriviaAnswers,
    triviaAnswers,
  ]);

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
  const triviaOptionStyles = getOptionStyles(room.state, triviaAnswers);

  const doneAnswering =
    room.state.trivia && triviaAnswers.size >= room.state.trivia.minAnswers;
  const advanceBtnBackground =
    room.state.stage === RoomStage.FEEDBACK
      ? styles.bgBlue900
      : doneAnswering
      ? styles.bgGreen
      : styles.bgGray300;
  const advanceBtnTextStyle =
    room.state.stage === RoomStage.FEEDBACK || doneAnswering
      ? styles.textWhite
      : styles.textPenFaint;
  return (
    <SafeAreaView style={styles.topContainer}>
      <ScrollView style={styles.flex1} keyboardShouldPersistTaps="handled">
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
          <TriviaContainer state={room.state} style={[styles.mt4]}>
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
              disabled={!canAnswerTrivia(room.state.stage)}
              chipStyle={({ index }) => [
                styles.p0,
                styles.roundedLg,
                styles.mt2,
                triviaOptionStyles[index].chip,
              ]}
              onPress={({ index }) => {
                if (room.state.stage === RoomStage.SELF_TURN) {
                  setTriviaAnswers(
                    triviaAnswers
                      .toggle(index)
                      .takeRight(room.state.trivia?.maxAnswers ?? 0)
                  );
                }
              }}
            >
              {({ item, index }) => (
                <View
                  style={[styles.py2, styles.pl2, styles.pr4, styles.flex1]}
                >
                  {triviaOptionStyles[index].barGraph &&
                    room.state.stage === RoomStage.FEEDBACK && (
                      <View
                        style={[
                          styles.absolute,
                          styles.inset0,
                          styles.zMinusOne,
                          triviaOptionStyles[index].barGraph,
                        ]}
                      />
                    )}
                  <Text
                    style={[
                      styles.textMd,
                      styles.fontBold,
                      room.state.stage === RoomStage.FEEDBACK
                        ? [styles.mt2]
                        : [styles.my4],
                    ]}
                  >
                    {item.answer}
                  </Text>
                  {room.state.stage === RoomStage.FEEDBACK &&
                    room.state.trivia && (
                      <Text style={[styles.textMd, styles.italic, styles.mb2]}>
                        <StatDisplay trivia={room.state.trivia} option={item} />
                      </Text>
                    )}
                  {triviaAnswers.has(index) &&
                    triviaOptionStyles[index].selectionOrderDisp && (
                      <View
                        style={[
                          styles.absolute,
                          styles.right0,
                          styles.mt2,
                          styles.mr2,
                        ]}
                      >
                        <Text
                          style={triviaOptionStyles[index].selectionOrderDisp}
                        >
                          {(triviaAnswers.getIndex(index) ?? 0) + 1}
                        </Text>
                      </View>
                    )}
                </View>
              )}
            </ChipPicker>
            {shouldShowAdvanceButton(room.state) && (
              <TouchableOpacity
                style={[
                  styles.roundedLg,
                  styles.flexGrow,
                  styles.mt8,
                  styles.mx6,
                  styles.p4,
                  advanceBtnBackground,
                ]}
                disabled={!doneAnswering}
                onPress={() => {
                  if (room.state.selfId === undefined || !doneAnswering) {
                    return;
                  }
                  if (room.state.stage === RoomStage.SELF_TURN) {
                    room.broadcast({
                      event: 'turn:feedback',
                      answered: triviaAnswers.toList(),
                    });
                  } else {
                    room.broadcast({
                      event: 'turn:end',
                      scoreChanges: room.state.players.scoresWithUpdates([
                        {
                          userId: room.state.selfId,
                          score: allCorrect(room.state, triviaAnswers) ? 1 : 0,
                        },
                      ]),
                    });
                  }
                }}
              >
                <Text style={[styles.textCenter, advanceBtnTextStyle]}>
                  {room.state.stage === RoomStage.SELF_TURN
                    ? 'SUBMIT'
                    : 'CONTINUE'}
                </Text>
              </TouchableOpacity>
            )}
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
          <GridLayout
            gridMaxWidth={styleConfig.topMaxWidth}
            horizontalInset={0}
            minColumnWidth={1}
            maxColumnCount={1}
            style={styles.mt4}
            data={room.state.players.array}
          >
            {({ item }) => (
              <View
                key={item.id}
                style={[styles.row, styles.flex1, styles.mt2, styles.mx6]}
              >
                <Text>
                  {item.name}
                  {item.isPresent ? '' : ' (offline)'}
                </Text>
                <Text>{room.state.players.getScore(item.id) ?? '?'}</Text>
              </View>
            )}
          </GridLayout>
        </SwipeablePanel>
      )}
    </SafeAreaView>
  );
}
