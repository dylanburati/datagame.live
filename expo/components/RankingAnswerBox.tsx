import React, { useLayoutEffect } from 'react';
import { Text, View, ViewStyle } from 'react-native';
import {
  isFeedbackStage,
  StyledTriviaOption,
  getCorrectArray,
  RoomStateWithTrivia,
  RoomPhase,
  expectedAnswersArePresent,
} from '../helpers/nplayerLogic';
import { TaggedTriviaOption } from '../helpers/api';
import { AnimatedChipPicker } from './AnimatedChipPicker';
import { AnswerBoxProps } from './AnswerBoxProps';
import { MultipleChoiceOptionView } from './MultipleChoiceOptionView';
import { styles } from '../styles';

function getStyledOptions(
  state: RoomStateWithTrivia,
  defaultBg: ViewStyle
): StyledTriviaOption[] {
  const { phase, trivia, statAnnotation } = state;
  const hasNumeric =
    trivia.questionValueType === 'date' ||
    trivia.questionValueType === 'number';
  if (!isFeedbackStage(phase) || !hasNumeric) {
    return trivia.options.map((option) => ({
      option,
      chipStyle: [defaultBg],
    }));
  }
  const axisMin = statAnnotation?.axisMin;
  const axisMax = statAnnotation?.axisMax;

  const graded = expectedAnswersArePresent(state)
    ? getCorrectArray(state)
    : { correctArray: [] };
  const numeric =
    trivia.questionValueType === 'date'
      ? trivia.options.map(({ questionValue }) =>
          new Date(questionValue).getTime()
        )
      : trivia.options.map(({ questionValue }) => questionValue);
  const axisConsideredVals = [
    ...numeric,
    ...(axisMin != null ? [axisMin] : []),
    ...(axisMax != null ? [axisMax] : []),
  ];
  let max = Math.max(...axisConsideredVals);
  let min = Math.min(...axisConsideredVals);
  const padding = Math.max((max - min) / 6, 0.01);
  if (min !== axisMin) {
    if (trivia.questionValueType === 'number') {
      min = Math.min(0, min);
    } else {
      min -= padding;
    }
  }
  if (max !== axisMax) {
    max += padding;
  }
  const changeSignToIndicator = new Map([
    [-1, '▲'],
    [1, '▼'],
  ]);
  const getIndicator = (val: number | undefined) =>
    val !== undefined ? changeSignToIndicator.get(Math.sign(val)) : undefined;
  return numeric.map((num, index) => {
    const frac = (num - min) / (max - min);
    const isCorrect: boolean | undefined = graded.correctArray[index];
    return {
      option: trivia.options[index],
      chipStyle: [
        styles.bgPaperDarker,
        isCorrect === true
          ? [styles.borderGreenAccent]
          : isCorrect === false
          ? [styles.borderRedAccent]
          : [styles.borderGray400],
      ],
      barGraph: [
        isCorrect === true
          ? styles.bgSeaGreen300
          : isCorrect === false
          ? styles.bgRed300
          : styles.bgGray350,
        {
          width: `${Math.round(100 * frac)}%`,
        },
      ],
      numericValue: num,
      directionIndicator:
        graded.changeInRanking && getIndicator(graded.changeInRanking[index]),
    };
  });
}

export function RankingAnswerBox({
  state,
  triviaAnswers,
  setTriviaAnswers,
  setDoneAnswering,
}: AnswerBoxProps) {
  const { trivia } = state;
  const defaultBg = styles.bgPaperDarker;
  const styledOptions = getStyledOptions(state, defaultBg);
  const orderedOptions = triviaAnswers
    .toList()
    .map((id) => styledOptions.find(({ option }) => option.id === id))
    .filter((opt): opt is StyledTriviaOption => opt !== undefined);
  useLayoutEffect(() => {
    if (triviaAnswers.size < trivia.minAnswers) {
      setTriviaAnswers(
        triviaAnswers.clear().extend(trivia.options.map((e) => e.id))
      );
      setDoneAnswering(true);
    }
  });

  return (
    <>
      <AnimatedChipPicker
        style={[
          styles.mt4,
          styles.mx6,
          styles.startAll,
          styles.flexCol,
          styles.itemsStretch,
          styles.minH200Px,
        ]}
        data={orderedOptions}
        keySelector={({ option }) => String(option.id)}
        chipStyle={({ item: { chipStyle } }) => [
          styles.p0,
          styles.roundedLg,
          styles.mt2,
          chipStyle,
        ]}
        disabled={state.phase !== RoomPhase.QUESTION}
        sorter={(
          { option: a, numericValue: av },
          { option: b, numericValue: bv }
        ) => {
          const mult = trivia.answerType === 'stat.desc' ? -1 : 1;
          const diff = mult * ((av ?? 0) - (bv ?? 0));
          return diff !== 0 ? diff : a.id - b.id;
        }}
        showSorted={isFeedbackStage(state.phase)}
        onDragEnd={(fromPos, toPos) => {
          if (fromPos !== toPos) {
            setTriviaAnswers(triviaAnswers.reinsertAt(fromPos, toPos));
          }
        }}
      >
        {({ item: { option, barGraph, directionIndicator }, index }) => (
          <MultipleChoiceOptionView
            item={
              {
                kind: trivia.questionValueType,
                ...option,
              } as TaggedTriviaOption
            }
            index={index}
            state={state}
            showUnderlay={!!barGraph}
            underlayStyle={barGraph}
            directionIndicator={directionIndicator}
            isDraggable={state.phase === RoomPhase.QUESTION}
          />
        )}
      </AnimatedChipPicker>
      {state.phase === RoomPhase.QUESTION && (
        <View style={[styles.mt8, styles.row, styles.centerAll]}>
          <Text style={[styles.textPenFainter, styles.textCenter]}>
            {['DRAG TO REORDER', '﹉'.repeat(20)].join('\n')}
          </Text>
        </View>
      )}
    </>
  );
}
