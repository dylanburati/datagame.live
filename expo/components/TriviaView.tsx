import React from 'react';
import { Text, TouchableOpacity, View, ViewProps } from 'react-native';
import { OrderedSet } from '../helpers/data';
import {
  RoomStage,
  RoomStateWithTrivia,
  getStyledOptions,
  canAnswerTrivia,
  isFeedbackStage,
  shouldShowAdvanceButton,
  hasNumericSelectionOrder,
  StyledTriviaOption,
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
  showUnderlay?: boolean;
  underlayStyle?: ViewProps['style'];
  directionIndicator?: string;
};

function OptionView({
  item,
  index,
  state,
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
              <TriviaStatDisplay
                statDef={state.triviaStats?.definition}
                numValue={state.triviaStats?.values.get(item.id) ?? NaN}
                option={item}
              />
            </Text>
          )}
          {}
        </View>
        {isMatchRank && (
          <TriviaMatchRankDisplay
            roomState={state}
            option={item}
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
  const { trivia, triviaStats } = state;
  const styledOptions = getStyledOptions(state, triviaAnswers, splitView);

  if (splitView) {
    const selfTurn =
      state.selfId !== undefined && state.selfId === state.players.activeId;
    const splitViewSortable = selfTurn
      ? triviaAnswers
          .toList()
          .map((id) => styledOptions.find(({ option }) => option.id === id))
          .filter((opt): opt is StyledTriviaOption => opt !== undefined)
      : styledOptions;
    const splitViewBank = selfTurn
      ? styledOptions.filter(({ option }) => !triviaAnswers.has(option.id))
      : [];

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
          data={splitViewSortable}
          keySelector={({ option }) => String(option.id)}
          chipStyle={({ item: { chipStyle } }) => [
            styles.p0,
            styles.roundedLg,
            styles.mt2,
            chipStyle,
          ]}
          disabled={!canAnswerTrivia(state.stage)}
          sorter={({ option: a }, { option: b }) => {
            const mult = trivia.answerType === 'stat.desc' ? -1 : 1;
            const av = triviaStats?.values.get(a.id) ?? 0;
            const bv = triviaStats?.values.get(b.id) ?? 0;
            const diff = mult * (av - bv);
            return diff !== 0 ? diff : a.id - b.id;
          }}
          showSorted={isFeedbackStage(state.stage)}
          onDragEnd={(fromPos, toPos) => {
            if (fromPos !== toPos) {
              setTriviaAnswers(triviaAnswers.reinsertAt(fromPos, toPos));
            }
          }}
        >
          {({ item: { option, barGraph, directionIndicator }, index }) => (
            <OptionView
              item={option}
              index={index}
              state={state}
              showUnderlay={!!barGraph}
              underlayStyle={barGraph}
              directionIndicator={directionIndicator}
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
            keySelector={({ option }) => String(option.id)}
            disabled={!canAnswerTrivia(state.stage)}
            chipStyle={({ item: { chipStyle } }) => [
              styles.p0,
              styles.roundedLg,
              styles.mt2,
              chipStyle,
            ]}
            onPress={({ item: { option } }) => {
              setTriviaAnswers(triviaAnswers.append(option.id));
            }}
          >
            {({ item: { option }, index }) => (
              <OptionView item={option} index={index} state={state} />
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
      data={styledOptions}
      disabled={!canAnswerTrivia(state.stage)}
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
      {({ item: { option, barGraph }, index }) => (
        <OptionView
          item={option}
          index={index}
          state={state}
          showUnderlay={!!barGraph}
          underlayStyle={barGraph}
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
      <Text style={[styles.mt4, styles.mx2, styles.textCenter]}>
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
