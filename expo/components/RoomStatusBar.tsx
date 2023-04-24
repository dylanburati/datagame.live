import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  ImageSourcePropType,
  ColorValue,
} from 'react-native';
import { ChannelHook, useAnimatedValue } from '../helpers/hooks';
import { RoomPhase, RoomState, triviaIsPresent } from '../helpers/nplayerLogic';
import { styles } from '../styles';
import { RoomOutgoingMessage } from '../helpers/api';
import { paintings } from '../helpers/iconography';
import { comparingBy } from '../helpers/lang';
import Svg, { Circle, ClipPath, G, Image as SvgImage } from 'react-native-svg';

type RoomAvatarProps = {
  icon: ImageSourcePropType;
  borderColor: ColorValue;
  borderFraction: number;
};

class RoomAvatar extends React.Component<RoomAvatarProps> {
  render() {
    const { icon, borderColor, borderFraction } = this.props;
    return (
      <Svg style={[styles.aspect1, styles.flexShrink]} viewBox="0 0 100 100">
        <ClipPath id="clip-path">
          <Circle cx={50} cy={50} r={44} />
        </ClipPath>
        <SvgImage
          href={icon}
          x={6}
          y={6}
          height={88}
          width={88}
          clipPath="url(#clip-path)"
        />
        <G translateX={50} translateY={50}>
          <Circle
            r={48}
            rotation={-90}
            stroke={borderColor}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={[borderFraction, 99999]}
          />
        </G>
      </Svg>
    );
  }
}

const AnimatedRoomAvatar = Animated.createAnimatedComponent(RoomAvatar);

export type RoomStatusBarProps = {
  room: ChannelHook<RoomOutgoingMessage, RoomState>;
};

export function RoomStatusBar({ room }: RoomStatusBarProps) {
  const { state, connected } = room;
  const [hasConnected, setHasConnected] = useState(connected);
  useEffect(() => {
    if (connected) {
      setHasConnected(true);
    }
  }, [connected]);

  const fraction = useAnimatedValue(0);
  const width = fraction.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '314.2%'],
    extrapolate: 'clamp',
  });
  const deadline = state.phase === RoomPhase.QUESTION ? state.deadline : 1;
  const durationMillis =
    state.phase === RoomPhase.QUESTION ? state.durationMillis : 1;
  useEffect(() => {
    if (state.phase !== RoomPhase.QUESTION) {
      fraction.setValue(0);
    } else {
      fraction.setValue(1 - (deadline - Date.now()) / durationMillis);
      Animated.timing(fraction, {
        toValue: 1,
        easing: Easing.linear,
        duration: deadline - Date.now(),
        useNativeDriver: false,
      }).start();
    }
  }, [fraction, state.phase, deadline, durationMillis]);

  const barStyles = [
    styles.borderGray300,
    styles.borderBottom,
    styles.px4,
    styles.pb1_5,
  ];
  if (!connected || state.phase === RoomPhase.NOT_REGISTERED) {
    return (
      <View style={barStyles}>
        <View style={[styles.flexRow, styles.justifyCenter, styles.py2]}>
          <Text>
            {hasConnected ? 'Lost connection, retrying...' : 'Connecting...'}
          </Text>
        </View>
      </View>
    );
  }

  const turnId = triviaIsPresent(state) ? state.turnId : -1;
  const icons = paintings();
  const displayPlayers = state.players.array
    .slice()
    .sort(comparingBy((player) => player.id))
    .map((player, idx) => ({ player, icon: icons[idx] }))
    .sort(
      comparingBy(({ player }) => (player.id === state.selfId ? -1 : player.id))
    );
  return (
    <View style={barStyles}>
      <View
        style={[
          styles.flexRow,
          styles.justifyCenter,
          styles.itemsCenter,
          styles.wFull,
          styles.py2,
        ]}
      >
        {displayPlayers
          .map((e) => ({
            ...e,
            grade: state.players.getGrade(e.player.id, turnId),
          }))
          .flatMap(({ player, icon, grade }, index) => [
            index === 0 && (
              <View
                key={`l-${player.id}`}
                style={[styles.flexBasis16, styles.flexShrink]}
              />
            ),
            <View key={`c-${player.id}`} style={[styles.maxH54Px]}>
              <AnimatedRoomAvatar
                icon={icon}
                borderColor={
                  grade === null
                    ? styles.textBlueAccent.color
                    : grade
                    ? styles.textGreenAccent.color
                    : styles.textRed.color
                }
                borderFraction={grade !== null ? 99999 : width}
              />
            </View>,
            index === 0 && displayPlayers.length > 1 && (
              <View
                key={`cr-${player.id}`}
                style={[styles.flexBasis16, styles.flexShrink]}
              />
            ),
            index === 0 && displayPlayers.length > 1 && (
              <View key={`crr-${player.id}`}>
                <Text style={[styles.text2Xl, styles.textPenFainter]}>·</Text>
              </View>
            ),
            <View
              key={`r-${player.id}`}
              style={[styles.flexBasis16, styles.flexShrink]}
            />,
          ])}
      </View>
    </View>
  );
}
