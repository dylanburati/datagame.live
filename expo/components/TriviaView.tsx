import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { OrderedSet } from '../helpers/data';
import {
  RoomStage,
  RoomState,
  getOptionStyles,
  canAnswerTrivia,
  isFeedbackStage,
  shouldShowAdvanceButton,
} from '../helpers/nplayerLogic';
import { ChipPicker } from './ChipPicker';
import { TriviaStatDisplay } from './TriviaStatDisplay';
import { styles } from '../styles';

export type TriviaViewProps = {
  state: RoomState;
  triviaAnswers: OrderedSet<number>;
  doneAnswering?: boolean;
  doAdvance: () => void;
  onOptionPress: (whichOption: number) => void;
};

export function TriviaView({
  state,
  triviaAnswers,
  doneAnswering,
  doAdvance,
  onOptionPress,
}: TriviaViewProps) {
  if (!state.trivia) {
    return null;
  }

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
  const triviaOptionStyles = getOptionStyles(state, triviaAnswers);

  return (
    <>
      <Text style={[styles.mt4, styles.textCenter]}>
        {state.trivia.question}
      </Text>
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
        onPress={({ index }) => onOptionPress(index)}
      >
        {({ item, index }) => (
          <View style={[styles.py2, styles.pl2, styles.pr4, styles.flex1]}>
            {triviaOptionStyles[index].barGraph &&
              isFeedbackStage(state.stage) && (
                <View
                  style={[
                    styles.absolute,
                    styles.inset0,
                    styles.zMinusOne,
                    styles.roundedTopLeftLg,
                    styles.roundedBottomLeftLg,
                    triviaOptionStyles[index].barGraph,
                  ]}
                />
              )}
            <Text
              style={[
                styles.textMd,
                styles.fontBold,
                isFeedbackStage(state.stage) ? [styles.mt2] : [styles.my4],
              ]}
            >
              {item.answer}
            </Text>
            {isFeedbackStage(state.stage) && state.trivia && (
              <Text style={[styles.textMd, styles.italic, styles.mb2]}>
                <TriviaStatDisplay
                  roomState={state}
                  option={item}
                  answers={triviaAnswers}
                  index={index}
                />
              </Text>
            )}
            {triviaAnswers.has(index) &&
              triviaOptionStyles[index].selectionOrderDisp && (
                <View
                  style={[
                    styles.absolute,
                    styles.right0,
                    styles.mt2,
                    styles.mr2,
                  ]}
                >
                  <Text style={triviaOptionStyles[index].selectionOrderDisp}>
                    {(triviaAnswers.getIndex(index) ?? 0) + 1}
                  </Text>
                </View>
              )}
          </View>
        )}
      </ChipPicker>
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
