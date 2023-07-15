import React from 'react';
import { FormattedDate, FormattedNumber } from 'react-intl';
import { TaggedTriviaOption, TriviaStatAnnotation } from '../helpers/api';
import { relativeDeltaToNow } from '../helpers/math';
import { assertUnreachable } from '../helpers/lang';

export type TriviaStatDisplayProps = {
  option: TaggedTriviaOption;
  statAnnotation?: TriviaStatAnnotation;
};

export function TriviaStatDisplay({
  option,
  statAnnotation,
}: TriviaStatDisplayProps) {
  switch (option.kind) {
    case 'date':
      if (statAnnotation?.axisMod === 'age') {
        const birthday = new Date(option.questionValue);
        const [years] = relativeDeltaToNow(birthday);
        return (
          <>
            {years} (born{' '}
            <FormattedDate value={birthday} month="long" day="numeric" />)
          </>
        );
      }
      return (
        <FormattedDate
          value={option.questionValue}
          year="numeric"
          month="long"
        />
      );

    case 'number':
      if (statAnnotation?.axisMod === 'distance') {
        return (
          <FormattedNumber
            value={Math.round(option.questionValue * 0.621371)}
            style="unit"
            unit="mile"
          />
        );
      }
      if (statAnnotation?.axisMod === 'dollar_amount') {
        return (
          <FormattedNumber
            style="currency"
            currency="USD"
            value={option.questionValue}
          />
        );
      }
      return <FormattedNumber value={option.questionValue} />;

    case 'number[]':
      return null;

    case 'string':
      return <>{option.questionValue}</>;

    case 'string[]':
      const commaList =
        option.questionValue.slice(0, 2).join(', ') +
        (option.questionValue.length > 2 ? '...' : '');
      return <>{commaList}</>;

    default:
      assertUnreachable(option);
  }
}
