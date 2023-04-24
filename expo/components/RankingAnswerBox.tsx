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
import { AnimatedChipPicker } from './AnimatedChipPicker';
import { AnswerBoxProps } from './AnswerBoxProps';
import { MultipleChoiceOptionView } from './MultipleChoiceOptionView';
import { styles } from '../styles';

function getStyledOptions(
  state: RoomStateWithTrivia,
  defaultBg: ViewStyle
): StyledTriviaOption[] {
  const { phase, trivia, triviaStats } = state;
  if (triviaStats == null || !isFeedbackStage(phase)) {
    return trivia.options.map((option) => ({
      option,
      chipStyle: [defaultBg],
    }));
  }

  const graded = expectedAnswersArePresent(state)
    ? getCorrectArray(state)
    : { correctArray: [] };
  const { values, definition: statDef } = triviaStats;
  const numeric = trivia.options.map(({ id }) => values.get(id) ?? 0);
  const axisConsideredVals = [
    ...numeric,
    ...(statDef.axisMin != null ? [statDef.axisMin] : []),
    ...(statDef.axisMax != null ? [statDef.axisMax] : []),
  ];
  let max = Math.max(...axisConsideredVals);
  let min = Math.min(...axisConsideredVals);
  const padding = Math.max((max - min) / 6, 0.01);
  if (min !== statDef.axisMin) {
    if (['dollar_amount', 'number', 'km_distance'].includes(statDef.type)) {
      min = Math.min(0, min);
    } else {
      min -= padding;
    }
  }
  if (max !== statDef.axisMax) {
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
  const { trivia, triviaStats } = state;
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
        sorter={({ option: a }, { option: b }) => {
          const mult = trivia.answerType === 'stat.desc' ? -1 : 1;
          const av = triviaStats?.values.get(a.id) ?? 0;
          const bv = triviaStats?.values.get(b.id) ?? 0;
          const diff = mult * (av - bv);
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
            item={option}
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
