import { OrderedSet } from '../helpers/data';
import { RoomStateWithTrivia } from '../helpers/nplayerLogic';

export type AnswerBoxProps = {
  state: RoomStateWithTrivia;
  triviaAnswers: OrderedSet<number>;
  setTriviaAnswers: (answers: OrderedSet<number>) => void;
  setDoneAnswering: (isDone: boolean) => void;
};
