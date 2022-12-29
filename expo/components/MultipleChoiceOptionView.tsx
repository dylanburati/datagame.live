import React from 'react';
import { Text, View, ViewProps } from 'react-native';
import { RoomStateWithTrivia, isFeedbackStage } from '../helpers/nplayerLogic';
import { TriviaStatDisplay } from './TriviaStatDisplay';
import { TriviaOption } from '../helpers/api';
import { styles } from '../styles';
import { TriviaMatchRankDisplay } from './TriviaMatchRankDisplay';

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

export type MultipleChoiceOptionViewProps = {
  item: TriviaOption;
  index: number;
  state: RoomStateWithTrivia;
  showUnderlay?: boolean;
  underlayStyle?: ViewProps['style'];
  directionIndicator?: string;
};

export function MultipleChoiceOptionView({
  item,
  index,
  state,
  showUnderlay = false,
  underlayStyle,
  directionIndicator,
}: MultipleChoiceOptionViewProps) {
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