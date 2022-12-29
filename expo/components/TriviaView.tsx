import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { OrderedSet } from '../helpers/data';
import {
  RoomStage,
  RoomStateWithTrivia,
  canAnswerTrivia,
  shouldShowAdvanceButton,
  hasNumericSelectionOrder,
} from '../helpers/nplayerLogic';
import { KeyboardAnswerBox } from './KeyboardAnswerBox';
import { MultipleChoiceAnswerBox } from './MultipleChoiceAnswerBox';
import { RankingAnswerBox } from './RankingAnswerBox';
import { styles } from '../styles';

export type TriviaViewProps = {
  state: RoomStateWithTrivia;
  triviaAnswers: OrderedSet<number>;
  setTriviaAnswers: React.Dispatch<React.SetStateAction<OrderedSet<number>>>;
  doAdvance: () => void;
};

export function TriviaView({
  state,
  triviaAnswers,
  doAdvance,
  setTriviaAnswers,
}: TriviaViewProps) {
  const [doneAnswering, setDoneAnswering] = useState(false);
  const advanceBtnBackground =
    state.stage === RoomStage.FEEDBACK_SELF_TURN
      ? styles.bgBlue900
      : doneAnswering
      ? styles.bgGreen
      : styles.bgGray300;
  const advanceBtnTextStyle =
    state.stage === RoomStage.FEEDBACK_SELF_TURN || doneAnswering
      ? styles.textWhite
      : styles.textPenFaint;
  const AnswerBox = hasNumericSelectionOrder(state.trivia)
    ? RankingAnswerBox
    : state.trivia.answerType === 'hangman'
    ? KeyboardAnswerBox
    : MultipleChoiceAnswerBox;
  const submitWhenReady = state.trivia.answerType === 'hangman';
  const autohideSubmit = submitWhenReady && canAnswerTrivia(state.stage);

  useEffect(() => {
    if (doneAnswering && submitWhenReady) {
      doAdvance();
    }
  }, [doAdvance, doneAnswering, submitWhenReady]);

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
      {shouldShowAdvanceButton(state) && !autohideSubmit && (
        <TouchableOpacity
          style={[
            styles.roundedLg,
            styles.flexGrow,
            styles.mt8,
            styles.mx6,
            styles.p4,
            advanceBtnBackground,
          ]}
          disabled={
            !doneAnswering && state.stage !== RoomStage.FEEDBACK_SELF_TURN
          }
          onPress={doAdvance}
        >
          <Text style={[styles.textCenter, advanceBtnTextStyle]}>
            {canAnswerTrivia(state.stage) ? 'SUBMIT' : 'CONTINUE'}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}
