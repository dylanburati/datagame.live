import React, { useEffect } from 'react';
import {
  canAnswerTrivia,
  getCorrectArray,
  isFeedbackStage,
  RoomStateWithTrivia,
  StyledTriviaOption,
} from '../helpers/nplayerLogic';
import { OrderedSet } from '../helpers/data';
import { AnswerBoxProps } from './AnswerBoxProps';
import { ChipPicker } from './ChipPicker';
import { MultipleChoiceOptionView } from './MultipleChoiceOptionView';
import { styles } from '../styles';
import { ViewStyle } from 'react-native';

function getStyledOptions(
  state: RoomStateWithTrivia,
  answers: OrderedSet<number>,
  defaultBg: ViewStyle
): StyledTriviaOption[] {
  const { stage, trivia } = state;

  if (!isFeedbackStage(stage)) {
    return trivia.options.map((option) => ({
      option,
      chipStyle: answers.has(option.id)
        ? [styles.bgPurple300, styles.borderPurpleAccent]
        : [defaultBg],
    }));
  }
  const graded = getCorrectArray(state);
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
  const { stage, trivia } = state;
  const selfTurn =
    state.selfId !== undefined && state.selfId === state.players.activeId;
  const defaultBg =
    canAnswerTrivia(stage) || selfTurn
      ? styles.bgPaperDarker
      : styles.bgGray350;
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
      disabled={!canAnswerTrivia(stage)}
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
        <MultipleChoiceOptionView item={option} index={index} state={state} />
      )}
    </ChipPicker>
  );
}
