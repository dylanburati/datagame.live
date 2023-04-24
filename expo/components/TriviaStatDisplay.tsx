import React from 'react';
import { FormattedDate, FormattedNumber } from 'react-intl';
import { Trivia, TriviaStatDef } from '../helpers/api';
import { relativeDeltaToNow } from '../helpers/math';

export type TriviaStatDisplayProps = {
  statDef?: TriviaStatDef;
  numValue: number;
  option: Trivia['options'][0];
};

export function TriviaStatDisplay({
  statDef,
  numValue,
  option,
}: TriviaStatDisplayProps) {
  if (statDef) {
    if (Number.isNaN(numValue)) {
      return null;
    }
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
        if (
          statDef.axisMod === 'age' &&
          typeof option.questionValue === 'string'
        ) {
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
  if (typeof option.questionValue === 'undefined') {
    return null;
  }
  const array = Array.isArray(option.questionValue)
    ? option.questionValue
    : [option.questionValue];
  const commaList =
    array.slice(0, 2).join(', ') + (array.length > 2 ? '...' : '');
  return <>{commaList}</>;
}
