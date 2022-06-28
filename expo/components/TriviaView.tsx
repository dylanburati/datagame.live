import React from 'react';
import { Text, TouchableOpacity, View, ViewProps } from 'react-native';
import { OrderedSet } from '../helpers/data';
import {
  RoomStage,
  RoomStateWithTrivia,
  getOptionStyles,
  canAnswerTrivia,
  isFeedbackStage,
  shouldShowAdvanceButton,
  hasNumericSelectionOrder,
  statToNumber,
} from '../helpers/nplayerLogic';
import { ChipPicker } from './ChipPicker';
import { TriviaStatDisplay } from './TriviaStatDisplay';
import { TriviaOption } from '../helpers/api';
import { styles } from '../styles';
import { TriviaMatchRankDisplay } from './TriviaMatchRankDisplay';
import { AnimatedChipPicker } from './AnimatedChipPicker';

type UnderlayProps = {
  style: ViewProps['style'];
};

function Underlay({ style }: UnderlayProps) {
  return (
    <View
      style={[
        styles.absolute,
        styles.inset0,
        styles.zMinusOne,
        styles.roundedTopLeftLg,
        styles.roundedBottomLeftLg,
        style,
      ]}
    />
  );
}

type OptionViewProps = {
  item: TriviaOption;
  index: number;
  state: RoomStateWithTrivia;
  answers: OrderedSet<number>;
  showUnderlay?: boolean;
  underlayStyle?: ViewProps['style'];
  directionIndicator?: string;
};

function OptionView({
  item,
  index,
  state,
  answers,
  showUnderlay = false,
  underlayStyle,
  directionIndicator,
}: OptionViewProps) {
  if (!state.trivia) {
    return null;
  }

  const isMatchRank = state.trivia.answerType === 'matchrank';
  if (isFeedbackStage(state.stage)) {
    return (
      <>
        <View
          style={[
            styles.py2,
            styles.pl2,
            styles.pr4,
            styles.flex1,
            styles.flexCol,
            styles.justifyCenter,
          ]}
        >
          {showUnderlay && <Underlay style={underlayStyle} />}
          <Text
            style={[
              styles.textMd,
              styles.fontBold,
              isMatchRank && styles.my2_5,
            ]}
          >
            {item.answer}
          </Text>
          {!isMatchRank && (
            <Text style={[styles.textMd, styles.italic]}>
              <TriviaStatDisplay roomState={state} option={item} />
            </Text>
          )}
          {}
        </View>
        {isMatchRank && (
          <TriviaMatchRankDisplay
            roomState={state}
            answers={answers}
            index={index}
          />
        )}
        {directionIndicator && (
          <Text
            style={[
              styles.absolute,
              styles.top0,
              styles.right0,
              styles.mr2,
              styles.mt2,
              styles.textRed,
            ]}
          >
            {directionIndicator}
          </Text>
        )}
      </>
    );
  }
  return (
    <View
      style={[
        styles.py2,
        styles.pl2,
        styles.pr4,
        styles.flex1,
        styles.flexCol,
        styles.justifyCenter,
      ]}
    >
      <Text
        style={[
          styles.textMd,
          styles.fontBold,
          styles.my2_5,
          // isFeedbackStage(state.stage) ? [styles.mt2] : [styles.my4],
        ]}
      >
        {item.answer}
      </Text>
    </View>
  );
}

type TriviaAnswerBoxProps = {
  state: RoomStateWithTrivia;
  triviaAnswers: OrderedSet<number>;
  setTriviaAnswers: React.Dispatch<React.SetStateAction<OrderedSet<number>>>;
  splitView: boolean;
};

function TriviaAnswerBox({
  state,
  triviaAnswers,
  setTriviaAnswers,
  splitView,
}: TriviaAnswerBoxProps) {
  const { trivia } = state;
  const triviaOptionStyles = getOptionStyles(state, triviaAnswers, splitView);

  if (splitView) {
    const selfTurn =
      state.selfId !== undefined && state.selfId === state.players.activeId;
    const splitViewSortable = selfTurn
      ? triviaAnswers
      : OrderedSet.from(trivia.options.map((_, i) => i));
    const splitViewBank = trivia.options
      .map((_, i) => i)
      .filter((i) => !splitViewSortable.has(i));

    return (
      <>
        <AnimatedChipPicker
          style={[
            styles.mt4,
            styles.mx6,
            styles.startAll,
            styles.flexCol,
            styles.itemsStretch,
            { minHeight: 200 },
          ]}
          data={splitViewSortable.toList()}
          keySelector={(optionIndex) => String(optionIndex)}
          chipStyle={({ item: optionIndex }) => [
            styles.p0,
            styles.roundedLg,
            styles.mt2,
            triviaOptionStyles[optionIndex].chip,
          ]}
          disabled={!canAnswerTrivia(state.stage)}
          sorter={(ai, bi) => {
            const av = trivia.options[ai].questionValue;
            const bv = trivia.options[bi].questionValue;
            const mult = trivia.answerType === 'stat.desc' ? -1 : 1;
            const diff =
              mult *
              (statToNumber(trivia.statDef, av, 0) -
                statToNumber(trivia.statDef, bv, 0));
            return diff !== 0 ? diff : ai - bi;
          }}
          showSorted={isFeedbackStage(state.stage)}
          onDragEnd={(fromPos, toPos) => {
            if (fromPos !== toPos) {
              setTriviaAnswers(triviaAnswers.reinsertAt(fromPos, toPos));
            }
          }}
        >
          {({ item: optionIndex }) => (
            <OptionView
              item={trivia.options[optionIndex]}
              index={optionIndex}
              state={state}
              answers={triviaAnswers}
              showUnderlay={!!triviaOptionStyles[optionIndex].barGraph}
              underlayStyle={triviaOptionStyles[optionIndex].barGraph}
              directionIndicator={
                triviaOptionStyles[optionIndex].directionIndicator
              }
            />
          )}
        </AnimatedChipPicker>
        {splitViewBank.length > 0 && (
          <View style={[styles.mt8, styles.row, styles.centerAll]}>
            <Text style={[styles.textPenFainter, styles.textCenter]}>
              {['▲  TAP TO ADD  ▲', '﹉'.repeat(20)].join('\n')}
            </Text>
          </View>
        )}
        {canAnswerTrivia(state.stage) && (
          <ChipPicker
            style={[
              styles.mt4,
              styles.mx6,
              styles.startAll,
              styles.flexCol,
              styles.itemsStretch,
            ]}
            data={splitViewBank}
            keySelector={(optionIndex) => String(optionIndex)}
            disabled={!canAnswerTrivia(state.stage)}
            chipStyle={({ index }) => [
              styles.p0,
              styles.roundedLg,
              styles.mt2,
              triviaOptionStyles[index].chip,
            ]}
            onPress={({ item: optionIndex }) => {
              setTriviaAnswers(triviaAnswers.append(optionIndex));
            }}
          >
            {({ item: optionIndex }) => (
              <OptionView
                item={trivia.options[optionIndex]}
                index={optionIndex}
                state={state}
                answers={triviaAnswers}
              />
            )}
          </ChipPicker>
        )}
      </>
    );
  }

  return (
    <ChipPicker
      style={[
        styles.mt4,
        styles.mx6,
        styles.startAll,
        styles.flexCol,
        styles.itemsStretch,
      ]}
      data={state.trivia.options}
      disabled={!canAnswerTrivia(state.stage)}
      chipStyle={({ index }) => [
        styles.p0,
        styles.roundedLg,
        styles.mt2,
        triviaOptionStyles[index].chip,
      ]}
      onPress={({ index }) =>
        setTriviaAnswers(
          triviaAnswers.toggle(index).takeRight(trivia.maxAnswers)
        )
      }
    >
      {({ item, index }) => (
        <OptionView
          item={item}
          index={index}
          state={state}
          answers={triviaAnswers}
          showUnderlay={!!triviaOptionStyles[index].barGraph}
          underlayStyle={triviaOptionStyles[index].barGraph}
        />
      )}
    </ChipPicker>
  );
}

export type TriviaViewProps = {
  state: RoomStateWithTrivia;
  triviaAnswers: OrderedSet<number>;
  setTriviaAnswers: React.Dispatch<React.SetStateAction<OrderedSet<number>>>;
  doneAnswering?: boolean;
  doAdvance: () => void;
};

export function TriviaView({
  state,
  triviaAnswers,
  doneAnswering,
  doAdvance,
  setTriviaAnswers,
}: TriviaViewProps) {
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
  const splitView = hasNumericSelectionOrder(state.trivia);

  return (
    <>
      <Text style={[styles.mt4, styles.textCenter]}>
        {state.trivia.question}
      </Text>
      <TriviaAnswerBox
        state={state}
        triviaAnswers={triviaAnswers}
        setTriviaAnswers={setTriviaAnswers}
        splitView={splitView}
      />
      {shouldShowAdvanceButton(state) && (
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
