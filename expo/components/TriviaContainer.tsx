import React from 'react';
import { Text, View, ViewProps } from 'react-native';
import { RoomState } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type TriviaContainerProps = {
  state: RoomState;
  disabled: boolean;
  style: ViewProps['style'];
};

export function TriviaContainer({
  state,
  disabled,
  style,
  children,
}: React.PropsWithChildren<TriviaContainerProps>) {
  if (disabled || !state.trivia) {
    return null;
  }

  const selfTurn = state.players.activeId === state.selfId;
  let whoseTurn = selfTurn ? 'You' : `${state.players.activeName ?? '???'}`;
  const showLarge = selfTurn || state.participantId === state.selfId;
  if (state.participantId !== undefined) {
    const participant = state.players.array.find(
      (item) => item.id === state.participantId
    );
    const p2 =
      state.participantId === state.selfId ? 'you' : participant?.name ?? '???';
    whoseTurn += ` + ${p2}`;
  }

  const LargeDisplay: React.FC = ({ children: content }) => <>{content}</>;
  const BoxedDisplay: React.FC = ({ children: content }) => (
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
      {content}
    </View>
  );
  const Display = showLarge ? LargeDisplay : BoxedDisplay;

  return (
    <View style={style}>
      <View style={[styles.row, styles.itemsBaseline, styles.justifyCenter]}>
        <Text>(P{state.players.startedPlayerIndex + 1})</Text>
        <Text style={[styles.ml2, styles.textLg]}>{whoseTurn}</Text>
      </View>
      <Display>{children}</Display>
    </View>
  );
}
