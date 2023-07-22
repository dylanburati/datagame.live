import { AccelerometerMeasurement } from 'expo-sensors';

export enum GamePhase {
  NOT_LEVEL = 'NOT_LEVEL',
  READY = 'READY',
  QUESTION = 'QUESTION',
  FEEDBACK = 'FEEDBACK',
  FEEDBACK_NOT_LEVEL = 'FEEDBACK_NOT_LEVEL',
  FINISHED = 'FINISHED',
}

export function shouldShowTimer(gs: GamePhase) {
  return gs !== GamePhase.NOT_LEVEL && gs !== GamePhase.FINISHED;
}

export function shouldRunTimer(gs: GamePhase) {
  return gs !== GamePhase.NOT_LEVEL && gs !== GamePhase.FINISHED;
}

export function timerFormat(
  gs: GamePhase,
  gameLength: number,
  secsElapsed: number
) {
  const secondsLeft = Math.ceil(gameLength - secsElapsed);
  if (gs === GamePhase.READY) {
    return (secondsLeft - gameLength).toString();
  }
  const minutePart = Math.floor(secondsLeft / 60);
  const secondPart = Math.max(secondsLeft % 60, 0)
    .toString()
    .padStart(2, '0');
  return `${minutePart > 0 ? minutePart : ''}:${secondPart}`;
}

const fastSin = (deg: number) => Math.sin((deg * Math.PI) / 180);

/**
 * Accelerometer docs: https://developer.apple.com/documentation/coremotion/getting_raw_accelerometer_events
 * - +X points out from the phone's right side
 * - +Y points out from the phone's top (camera on an iPhone)
 * - +Z points out from front of phone
 * - LANDSCAPE_LEFT orients +X to the top
 * - for elevation angle, -Z is the y-coordinate
 * - for roll angle, +Y is the y-coordinate
 */
export function isAngleNeutral({ y, z }: AccelerometerMeasurement) {
  if (Math.abs(y) > fastSin(45)) {
    return false;
  }
  const elev = -z;
  return elev >= fastSin(-15) && elev <= fastSin(25);
}

export function isAngleDown({ y, z }: AccelerometerMeasurement) {
  if (Math.abs(y) > fastSin(45)) {
    return false;
  }
  const elev = -z;
  return elev <= fastSin(-50);
}

export function isAngleUp({ y, z }: AccelerometerMeasurement) {
  if (Math.abs(y) > fastSin(45)) {
    return false;
  }
  const elev = -z;
  return elev >= fastSin(60);
}
