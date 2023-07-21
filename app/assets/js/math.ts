function lastAnniversary(date: Date, reference: Date) {
  const nonLeapYearMs = 365 * 24 * 3600 * 1000;
  // always >= actual number of years
  let guess = Math.floor(
    (reference.getTime() - date.getTime()) / nonLeapYearMs
  );
  let anniversary = new Date(date);
  anniversary.setFullYear(date.getFullYear() + guess);
  while (anniversary > reference) {
    guess--;
    // the guessed date might have gone from 02-29 to 03-01; recreating the date
    // lets it go to 02-29 of the previous year, instead of staying on 03-01.
    anniversary = new Date(date);
    anniversary.setFullYear(date.getFullYear() + guess);
  }
  return anniversary;
}

export function relativeDeltaToNow(date: Date): [number, number] {
  const now = new Date();
  const anniversary = lastAnniversary(date, now);
  const years = anniversary.getFullYear() - date.getFullYear();
  return [years, now.getTime() - anniversary.getTime()];
}
