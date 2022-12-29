import React from 'react';
import { Image, Text, View } from 'react-native';
import { TriviaOption } from '../helpers/api';
import { OrderedSet } from '../helpers/data';
import { kissMarryShoot, medals } from '../helpers/iconography';
import { RoomState, RoomStage } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type TriviaMatchRankDisplayProps = {
  roomState: RoomState;
  option: TriviaOption;
  index: number;
};

export function TriviaMatchRankDisplay({
  roomState,
  option,
  index,
}: TriviaMatchRankDisplayProps) {
  const { trivia } = roomState;
  if (!trivia) {
    return null;
  }
  const firstId =
    roomState.stage === RoomStage.FEEDBACK_PARTICIPANT
      ? roomState.participantId
      : roomState.players.activeId;
  const secondId =
    roomState.stage === RoomStage.FEEDBACK_PARTICIPANT
      ? roomState.players.activeId
      : roomState.participantId;
  if (firstId === undefined || secondId === undefined) {
    return null;
  }
  const selfTurn = roomState.players.activeId === roomState.selfId;
  const whoseTurn =
    selfTurn || roomState.stage === RoomStage.FEEDBACK_PARTICIPANT
      ? 'You'
      : roomState.players.activeName ?? '';
  const whoseTurn2 =
    selfTurn || roomState.stage === RoomStage.FEEDBACK_PARTICIPANT
      ? 'Them'
      : roomState.participantId !== undefined
      ? roomState.players.getPlayerName(roomState.participantId) ?? ''
      : '';

  const answerList1 = roomState.receivedAnswers.get(firstId);
  const answerList2 = roomState.receivedAnswers.get(secondId);
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
          <Text style={[styles.fontBold, styles.opacity50]}>{whoseTurn}</Text>
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
          <Text style={[styles.fontBold, styles.opacity50]}>{whoseTurn2}</Text>
        )}
        <Image style={[styles.square20Px]} source={emojiArr[secondPos]} />
      </View>
    </>
  );
}
