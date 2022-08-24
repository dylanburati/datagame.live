import React from 'react';
import { FormattedDate, FormattedNumber } from 'react-intl';
import { TriviaOption } from '../helpers/api';
import { relativeDeltaToNow } from '../helpers/math';
import { RoomState, statToNumber } from '../helpers/nplayerLogic';

export type TriviaStatDisplayProps = {
  roomState: RoomState;
  option: TriviaOption;
};

export function TriviaStatDisplay({
  roomState,
  option,
}: TriviaStatDisplayProps) {
  const { trivia } = roomState;
  if (!trivia) {
    return null;
  }
  const { statDef } = trivia;
  const numValue = statToNumber(statDef, option.questionValue);
  if (statDef && !Number.isNaN(numValue)) {
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
