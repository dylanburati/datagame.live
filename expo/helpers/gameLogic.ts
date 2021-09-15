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

export function timerFormat(gs: GameStage, secondsLeft: number) {
  if (gs === GameStage.READY) {
    return (secondsLeft - 60).toString();
  }
  const minutePart = Math.floor(secondsLeft / 60);
  const secondPart = (secondsLeft % 60).toString().padStart(2, '0');
  return `${minutePart > 0 ? minutePart : ''}:${secondPart}`;
}

export function isAngleNeutral(angle: number) {
  return angle >= -15 && angle <= 25;
}

export function isAngleDown(angle: number) {
  return angle <= -50;
}

export function isAngleUp(angle: number) {
  return angle >= 60;
}
