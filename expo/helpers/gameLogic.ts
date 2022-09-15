import { memoize } from 'lodash';
import { ThreeAxisMeasurement } from 'expo-sensors';

export enum GameStage {
  NOT_LEVEL = 'NOT_LEVEL',
  READY = 'READY',
  QUESTION = 'QUESTION',
  FEEDBACK = 'FEEDBACK',
  FEEDBACK_NOT_LEVEL = 'FEEDBACK_NOT_LEVEL',
  FINISHED = 'FINISHED',
}

export function shouldShowTimer(gs: GameStage) {
  return gs !== GameStage.NOT_LEVEL && gs !== GameStage.FINISHED;
}

export function shouldRunTimer(gs: GameStage) {
  return gs !== GameStage.NOT_LEVEL && gs !== GameStage.FINISHED;
}

export function timerFormat(
  gs: GameStage,
  gameLength: number,
  secsElapsed: number
) {
  const secondsLeft = Math.ceil(gameLength - secsElapsed);
  if (gs === GameStage.READY) {
    return (secondsLeft - gameLength).toString();
  }
  const minutePart = Math.floor(secondsLeft / 60);
  const secondPart = Math.max(secondsLeft % 60, 0)
    .toString()
    .padStart(2, '0');
  return `${minutePart > 0 ? minutePart : ''}:${secondPart}`;
}

const fastSin = memoize((deg) => Math.sin((deg * Math.PI) / 180));

/**
 * Accelerometer docs: https://developer.apple.com/documentation/coremotion/getting_raw_accelerometer_events
 * - +X points out from the phone's right side
 * - +Y points out from the phone's top (camera on an iPhone)
 * - +Z points out from front of phone
 * - LANDSCAPE_LEFT orients +X to the top
 * - for elevation angle, -Z is the y-coordinate
 * - for roll angle, +Y is the y-coordinate
 */
export function isAngleNeutral({ y, z }: ThreeAxisMeasurement) {
  if (Math.abs(y) > fastSin(45)) {
    return false;
  }
  const elev = -z;
  return elev >= fastSin(-15) && elev <= fastSin(25);
}

export function isAngleDown({ y, z }: ThreeAxisMeasurement) {
  if (Math.abs(y) > fastSin(45)) {
    return false;
  }
  const elev = -z;
  return elev <= fastSin(-50);
}

export function isAngleUp({ y, z }: ThreeAxisMeasurement) {
  if (Math.abs(y) > fastSin(45)) {
    return false;
  }
  const elev = -z;
  return elev >= fastSin(60);
}
