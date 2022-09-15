import React from 'react';
import { Text, View, ViewProps } from 'react-native';
import { RoomState } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type TriviaContainerProps = {
  state: RoomState;
  disabled: boolean;
  style: ViewProps['style'];
};

const BoxedDisplay: React.FC<{ boxed: boolean }> = ({ boxed, children }) => {
  return boxed ? (
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
  ) : (
    <>{children}</>
  );
};

export function TriviaContainer({
  state,
  disabled,
  style,
  children,
}: React.PropsWithChildren<TriviaContainerProps>) {
  if (disabled) {
    return null;
  }

  const selfTurn = state.players.activeId === state.selfId;
  let whoseTurn = selfTurn ? 'You' : `${state.players.activeName ?? '???'}`;
  const showLarge = selfTurn || state.participantId === state.selfId;
  if (state.participantId !== undefined) {
    const p2 =
      state.participantId === state.selfId
        ? 'You'
        : state.players.getPlayerName(state.participantId) ?? '???';
    whoseTurn += ` + ${p2}`;
  }

  return (
    <View style={style}>
      <View style={[styles.row, styles.itemsBaseline, styles.justifyCenter]}>
        <Text>(P{state.players.playerIndex + 1})</Text>
        <Text style={[styles.ml2, styles.textLg]}>{whoseTurn}</Text>
      </View>
      <BoxedDisplay boxed={!showLarge}>{children}</BoxedDisplay>
    </View>
  );
}
