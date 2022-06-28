import React from 'react';
import { Image, Text, View } from 'react-native';
import { OrderedSet } from '../helpers/data';
import { kissMarryShoot, medals } from '../helpers/iconography';
import { argsort } from '../helpers/math';
import { RoomState, RoomStage } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type TriviaMatchRankDisplayProps = {
  roomState: RoomState;
  answers: OrderedSet<number>;
  index: number;
};

export function TriviaMatchRankDisplay({
  roomState,
  answers,
  index,
}: TriviaMatchRankDisplayProps) {
  const { trivia } = roomState;
  if (!trivia) {
    return null;
  }
  const otherId =
    roomState.stage === RoomStage.FEEDBACK_PARTICIPANT
      ? roomState.players.activeId
      : roomState.participantId;
  const recvArray = roomState.receivedAnswers.get(otherId ?? -1);
  if (!recvArray) {
    return null;
  }
  const order = argsort(recvArray, (a, b) => a - b);
  const emojiArr = /\bkill\b/i.test(trivia.question)
    ? kissMarryShoot()
    : medals();
  const selfSource = answers.getIndex(index);
  const otherSource = order[index];
  if (selfSource === undefined || otherSource === undefined) {
    return null;
  }
  return (
    <>
      <View
        style={[
          styles.itemsCenter,
          styles.justifySpaceAround,
          styles.flexCol,
          styles.mx2,
          styles.w50,
        ]}
      >
        {index === 0 && (
          <Text style={[styles.fontBold, styles.opacity50]}>You</Text>
        )}
        <Image
          style={[styles.square20Px, styles.raiseMinusOne]}
          source={emojiArr[selfSource]}
        />
      </View>
      <View
        style={[
          styles.itemsCenter,
          styles.justifySpaceAround,
          styles.flexCol,
          styles.mx2,
          styles.w50,
        ]}
      >
        {index === 0 && (
          <Text style={[styles.fontBold, styles.opacity50]}>Them</Text>
        )}
        <Image
          style={[styles.square20Px, styles.raiseMinusOne]}
          source={emojiArr[otherSource]}
        />
      </View>
    </>
  );
}
