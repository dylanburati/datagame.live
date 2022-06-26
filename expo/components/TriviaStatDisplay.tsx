import React from 'react';
import { Image } from 'react-native';
import { FormattedDate, FormattedNumber } from 'react-intl';
import { TriviaOption } from '../helpers/api';
import { OrderedSet } from '../helpers/data';
import { kissMarryShoot, medals } from '../helpers/iconography';
import { argsort, relativeDeltaToNow } from '../helpers/math';
import { RoomState, statToNumber, RoomStage } from '../helpers/nplayerLogic';
import { styles } from '../styles';

export type TriviaStatDisplayProps = {
  roomState: RoomState;
  option: TriviaOption;
  answers: OrderedSet<number>;
  index: number;
};

export function TriviaStatDisplay({
  roomState,
  option,
  answers,
  index,
}: TriviaStatDisplayProps) {
  const { trivia } = roomState;
  if (!trivia) {
    return null;
  }
  const { statDef, answerType } = trivia;
  const numValue = statToNumber(statDef, option.questionValue);
  if (answerType === 'matchrank') {
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
    const selfSource = answers.getIndex(index) ?? -1;
    const otherSource = order[index] ?? -1;
    const isMatch = order[index] === (answers.getIndex(index) ?? -1);
    return (
      <>
        {selfSource >= 0 && selfSource < emojiArr.length && (
          <Image
            style={[styles.square20Px, styles.raiseMinusOne]}
            source={emojiArr[selfSource]}
          />
        )}
        {!isMatch && (
          <>
            {' // '}
            {otherSource >= 0 && otherSource < emojiArr.length && (
              <Image
                style={[styles.square20Px, styles.raiseMinusOne]}
                source={emojiArr[otherSource]}
              />
            )}
          </>
        )}
      </>
    );
  } else if (statDef && !Number.isNaN(numValue)) {
    switch (statDef.type) {
      case 'km_distance':
        return (
          <FormattedNumber
            value={Math.round(numValue * 0.621371)}
            style="unit"
            unit="mile"
          />
        );
      case 'number':
        return <FormattedNumber value={numValue} />;
      case 'dollar_amount':
        return (
          <FormattedNumber style="currency" currency="USD" value={numValue} />
        );
      case 'date':
        if (statDef.axisMod === 'age' && !Array.isArray(option.questionValue)) {
          const birthday = new Date(option.questionValue);
          const [years] = relativeDeltaToNow(birthday);
          return (
            <>
              {years} (born{' '}
              <FormattedDate value={birthday} month="long" day="numeric" />)
            </>
          );
        }
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
