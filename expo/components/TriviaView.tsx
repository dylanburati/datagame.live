import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { OrderedSet } from '../helpers/data';
import {
  RoomPhase,
  RoomStateWithTrivia,
  hasNumericSelectionOrder,
} from '../helpers/nplayerLogic';
import { KeyboardAnswerBox } from './KeyboardAnswerBox';
import { MultipleChoiceAnswerBox } from './MultipleChoiceAnswerBox';
import { RankingAnswerBox } from './RankingAnswerBox';
import { styles } from '../styles';

export type TriviaViewProps = {
  state: RoomStateWithTrivia;
  triviaAnswers: OrderedSet<number>;
  setTriviaAnswers: (answers: OrderedSet<number>) => void;
  doAdvance: () => void;
};

export function TriviaView({
  state,
  triviaAnswers,
  doAdvance,
  setTriviaAnswers,
}: TriviaViewProps) {
  const [lastAnsweredId, setLastAnsweredId] = useState(-1);
  const doneAnswering = lastAnsweredId >= state.turnId;
  const setDoneAnswering = useCallback(
    (isDone: boolean) => {
      setLastAnsweredId(isDone ? state.turnId : state.turnId - 1);
    },
    [state.turnId]
  );
  const canAdvance =
    state.phase === RoomPhase.ROOM_FEEDBACK ||
    (state.phase === RoomPhase.QUESTION && doneAnswering);
  const advanceBtnBackground =
    state.phase === RoomPhase.ROOM_FEEDBACK
      ? styles.bgBlue900
      : canAdvance
      ? styles.bgGreen
      : styles.bgGray300;
  const advanceBtnTextStyle = canAdvance
    ? styles.textWhite
    : styles.textPenFaint;
  const AnswerBox = hasNumericSelectionOrder(state.trivia)
    ? RankingAnswerBox
    : state.trivia.answerType === 'hangman'
    ? KeyboardAnswerBox
    : MultipleChoiceAnswerBox;
  const submitWhenReady = state.trivia.answerType === 'hangman';
  const autohideSubmit = state.phase === RoomPhase.QUESTION && submitWhenReady;

  useEffect(() => {
    if (
      doneAnswering &&
      state.phase === RoomPhase.QUESTION &&
      submitWhenReady
    ) {
      doAdvance();
    }
  }, [doAdvance, doneAnswering, state.phase, submitWhenReady]);

  return (
    <>
      <Text style={[styles.mt4, styles.mx2, styles.textCenter]}>
        {state.trivia.question}
      </Text>
      <AnswerBox
        state={state}
        triviaAnswers={triviaAnswers}
        setTriviaAnswers={setTriviaAnswers}
        setDoneAnswering={setDoneAnswering}
      />
      {!autohideSubmit && (
        <TouchableOpacity
          style={[
            styles.roundedLg,
            styles.flexGrow,
            styles.mt8,
            styles.mx6,
            styles.p4,
            advanceBtnBackground,
          ]}
          disabled={!canAdvance}
          onPress={doAdvance}
        >
          <Text style={[styles.textCenter, advanceBtnTextStyle]}>
            {state.phase === RoomPhase.QUESTION ? 'SUBMIT' : 'CONTINUE'}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}
