import React from 'react';
import { FormattedRelativeTime } from 'react-intl';
import { RelativeTimeFormatSingularUnit } from '@formatjs/ecma402-abstract';

export type FormattedRelativeDateProps = {
  dateString: string;
};

export function FormattedRelativeDate({
  dateString,
}: FormattedRelativeDateProps) {
  const date = new Date(dateString);
  const delta = (date.getTime() - Date.now()) / 1000;
  const aDelta = Math.abs(delta);
  const units: [RelativeTimeFormatSingularUnit, number, number][] = [
    ['second', 1, 60],
    ['minute', 60, 60],
    ['hour', 60 * 60, 36],
    ['day', 60 * 60 * 24, 366],
    ['year', 60 * 60 * 24 * 365.25, 9999],
  ];
  const [unit, divisor] =
    units.find(([, base, max]) => aDelta < base * max) ||
    units[units.length - 1];
  const value = Math.sign(delta) * Math.floor(aDelta / divisor);
  return <FormattedRelativeTime value={value} unit={unit} />;
}
