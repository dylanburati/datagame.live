import React from 'react';
import { Image, Text, View } from 'react-native';
import { Trivia } from '../helpers/api';
import { OrderedSet } from '../helpers/data';
import { kissMarryShoot, medals } from '../helpers/iconography';
import { RoomStateWithTrivia } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type TriviaMatchRankDisplayProps = {
  roomState: RoomStateWithTrivia;
  option: Trivia['options'][0];
  index: number;
};

export function TriviaMatchRankDisplay({
  roomState,
  option,
  index,
}: TriviaMatchRankDisplayProps) {
  const { selfId, participantId, trivia } = roomState;

  const answerList1 = roomState.receivedAnswers.get(selfId);
  const answerList2 = roomState.receivedAnswers.get(participantId as number);
  if (answerList1 === undefined || answerList2 === undefined) {
    return null;
  }
  const answers1 = OrderedSet.from(answerList1);
  const answers2 = OrderedSet.from(answerList2);
  const emojiArr = /\bkill\b/i.test(trivia.question)
    ? kissMarryShoot()
    : medals();
  const firstPos = answers1.getIndex(option.id);
  const secondPos = answers2.getIndex(option.id);
  if (firstPos === undefined || secondPos === undefined) {
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
          styles.w40Px,
        ]}
      >
        {index === 0 && (
          <Text style={[styles.fontBold, styles.opacity50]}>You</Text>
        )}
        <Image style={[styles.square20Px]} source={emojiArr[firstPos]} />
      </View>
      <View
        style={[
          styles.itemsCenter,
          styles.justifySpaceAround,
          styles.flexCol,
          styles.mx2,
          styles.w40Px,
        ]}
      >
        {index === 0 && (
          <Text style={[styles.fontBold, styles.opacity50]}>Them</Text>
        )}
        <Image style={[styles.square20Px]} source={emojiArr[secondPos]} />
      </View>
    </>
  );
}
