import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import {
  expectedAnswersArePresent,
  getCorrectArray,
  isFeedbackStage,
  RoomPhase,
  RoomStateWithTrivia,
  StyledTriviaOption,
} from '../helpers/nplayerLogic';
import { OrderedSet } from '../helpers/data';
import { TaggedTriviaOption } from '../helpers/api';
import { AnswerBoxProps } from './AnswerBoxProps';
import { ChipPicker } from './ChipPicker';
import { MultipleChoiceOptionView } from './MultipleChoiceOptionView';
import { styles } from '../styles';

function getStyledOptions(
  state: RoomStateWithTrivia,
  answers: OrderedSet<number>,
  defaultBg: ViewStyle
): StyledTriviaOption[] {
  const { phase, trivia } = state;

  if (!isFeedbackStage(phase)) {
    return trivia.options.map((option) => ({
      option,
      chipStyle: answers.has(option.id)
        ? [styles.bgPurple300, styles.borderPurpleAccent]
        : [defaultBg],
    }));
  }
  const graded = expectedAnswersArePresent(state)
    ? getCorrectArray(state)
    : { correctArray: [] };
  return graded.correctArray.map((isCorrect, index) => ({
    option: trivia.options[index],
    chipStyle:
      isCorrect === true
        ? [styles.borderGreenAccent, styles.bgSeaGreen300]
        : isCorrect === false
        ? [styles.borderRedAccent, styles.bgRed300]
        : [defaultBg],
  }));
}

export function MultipleChoiceAnswerBox({
  state,
  triviaAnswers,
  setTriviaAnswers,
  setDoneAnswering,
}: AnswerBoxProps) {
  const { phase, trivia } = state;
  const defaultBg = styles.bgPaperDarker;
  const styledOptions = getStyledOptions(state, triviaAnswers, defaultBg);
  useEffect(() => {
    setDoneAnswering(triviaAnswers.size >= trivia.minAnswers);
  }, [setDoneAnswering, trivia.minAnswers, triviaAnswers.size]);

  return (
    <ChipPicker
      style={[
        styles.mt4,
        styles.mx6,
        styles.startAll,
        styles.flexCol,
        styles.itemsStretch,
      ]}
      data={styledOptions}
      disabled={phase !== RoomPhase.QUESTION}
      chipStyle={({ item: { chipStyle } }) => [
        styles.p0,
        styles.roundedLg,
        styles.mt2,
        chipStyle,
      ]}
      onPress={({ item: { option } }) =>
        setTriviaAnswers(
          triviaAnswers.toggle(option.id).takeRight(trivia.maxAnswers)
        )
      }
    >
      {({ item: { option }, index }) => (
        <MultipleChoiceOptionView
          item={
            {
              kind: trivia.questionValueType,
              ...option,
            } as TaggedTriviaOption
          }
          index={index}
          state={state}
        />
      )}
    </ChipPicker>
  );
}
