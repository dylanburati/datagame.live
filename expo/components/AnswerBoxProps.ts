import React from 'react';
import { OrderedSet } from '../helpers/data';
import { RoomStateWithTrivia } from '../helpers/nplayerLogic';

export type AnswerBoxProps = {
  state: RoomStateWithTrivia;
  triviaAnswers: OrderedSet<number>;
  setTriviaAnswers: React.Dispatch<React.SetStateAction<OrderedSet<number>>>;
  setDoneAnswering: React.Dispatch<React.SetStateAction<boolean>>;
};
