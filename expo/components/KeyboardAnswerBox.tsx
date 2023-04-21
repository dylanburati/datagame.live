import React, { useEffect } from 'react';
import { Image, Text, View, ViewStyle } from 'react-native';
import {
  RoomPhase,
  RoomStateWithTrivia,
  StyledTriviaOption,
} from '../helpers/nplayerLogic';
import { OrderedSet } from '../helpers/data';
import { AnswerBoxProps } from './AnswerBoxProps';
import { ChipPicker } from './ChipPicker';
import { styles } from '../styles';
import { TriviaOption } from '../helpers/api';
import { heart } from '../helpers/iconography';

const QWERTY = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function getStyledOptions(
  state: RoomStateWithTrivia,
  answers: OrderedSet<number>,
  defaultBg: ViewStyle
): StyledTriviaOption[] {
  const { trivia } = state;
  if (trivia.questionValueType !== 'number[]') {
    return [];
  }

  const isCorrect = (option: TriviaOption<number[]>) =>
    option.questionValue.length;
  return trivia.options.map((option) => ({
    option,
    chipStyle:
      answers.has(option.id) && isCorrect(option)
        ? [styles.borderGreenAccent, styles.bgSeaGreen300]
        : answers.has(option.id)
        ? [styles.borderRedAccent, styles.bgRed300]
        : [defaultBg],
  }));
}

export function KeyboardAnswerBox({
  state,
  triviaAnswers,
  setTriviaAnswers,
  setDoneAnswering,
}: AnswerBoxProps) {
  const { phase, trivia } = state;
  const defaultBg = styles.bgPaperDarker;
  const styledOptions = getStyledOptions(state, triviaAnswers, defaultBg);
  const keyboardRows = [
    styledOptions.slice(0, QWERTY[0].length),
    styledOptions.slice(QWERTY[0].length, QWERTY[0].length + QWERTY[1].length),
    styledOptions.slice(QWERTY[0].length + QWERTY[1].length),
  ];
  if (trivia.questionValueType !== 'number[]') {
    throw new Error();
  }

  const answerLength =
    1 + Math.max(...trivia.options.flatMap((option) => option.questionValue));
  const partialAnswer = new Array(answerLength).fill(' ');
  const numLives = 2;
  let numWrong = 0;
  let numUnfilled = 0;
  for (const option of trivia.options) {
    if (triviaAnswers.has(option.id) && option.questionValue.length === 0) {
      numWrong += 1;
    }
    for (const index of option.questionValue) {
      if (triviaAnswers.has(option.id)) {
        partialAnswer[index] = option.answer;
      } else {
        partialAnswer[index] = '_';
        numUnfilled += 1;
      }
    }
  }
  const doneAnswering = numWrong >= numLives || numUnfilled === 0;
  useEffect(() => {
    setDoneAnswering(doneAnswering);
  }, [doneAnswering, setDoneAnswering]);

  return (
    <>
      <Text
        style={[
          styles.mx6,
          styles.mt4,
          styles.textCenter,
          styles.flex1,
          styles.leadingXl,
          styles.textXl,
          styles.fontMonospace,
          styles.textTrackingExtraWide,
          styles.shiftOne,
        ]}
      >
        {partialAnswer.join('')}
      </Text>
      <View style={[styles.flexCol, styles.mx6, styles.mt8]}>
        <View style={[styles.flexRow, styles.selfCenter]}>
          <View style={[styles.flexRow, styles.wFiveSixths]}>
            <Image
              style={[styles.square15Px, styles.mx1, styles.raiseMinusOne]}
              source={heart()}
            />
            <Text style={[styles.textSm]}>× {numLives - numWrong}</Text>
          </View>
          <View style={styles.w40Px} />
        </View>
      </View>
      {keyboardRows.map((row, rowNum) => (
        <ChipPicker
          key={rowNum}
          style={[styles.mt2, styles.mx6, styles.row, styles.centerAll]}
          data={row}
          disabled={phase !== RoomPhase.QUESTION}
          chipStyle={({ item: { chipStyle } }) => [
            styles.p0,
            styles.py2,
            styles.roundedMd,
            styles.mx0_5,
            styles.wEleventh,
            chipStyle,
          ]}
          onPress={({ item: { option } }) =>
            setTriviaAnswers(triviaAnswers.append(option.id))
          }
        >
          {({ item: { option } }) => (
            <>
              <Text
                style={[
                  styles.textMd,
                  styles.fontBold,
                  styles.wFull,
                  styles.textCenter,
                ]}
              >
                {option.answer}
              </Text>
            </>
          )}
        </ChipPicker>
      ))}
    </>
  );
}
