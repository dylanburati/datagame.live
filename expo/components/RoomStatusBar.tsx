import React, { useEffect, useState } from 'react';
import { View, Text, Image, Animated, Easing } from 'react-native';
import { ChannelHook, useAnimatedValue } from '../helpers/hooks';
import { RoomPhase, RoomState, triviaIsPresent } from '../helpers/nplayerLogic';
import { styles } from '../styles';
import { RoomOutgoingMessage } from '../helpers/api';
import { paintings } from '../helpers/iconography';
import { comparingBy } from '../helpers/lang';

type RoomTurnProgressProps = {
  disabled: boolean;
  durationMillis: number;
  deadline: number;
};

function RoomTurnProgress({
  disabled,
  durationMillis,
  deadline,
}: RoomTurnProgressProps) {
  const fraction = useAnimatedValue(0);
  const width = fraction.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });
  useEffect(() => {
    if (disabled) {
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
  }, [disabled, deadline, fraction, durationMillis]);

  if (disabled) {
    return <View style={[styles.mt2]} />;
  }
  return (
    <View style={[styles.bgPaperDarker, styles.h1, styles.my2_5]}>
      <Animated.View style={[styles.bgBlue300, styles.h1, { width }]} />
    </View>
  );
}

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

  const barStyles = [styles.borderGray300, styles.borderBottom, styles.px4];
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
        {displayPlayers.flatMap(({ player, icon }, index) => [
          index === 0 && (
            <View
              key={`l-${player.id}`}
              style={[styles.flexBasis16, styles.flexShrink]}
            />
          ),
          <View key={`c-${player.id}`} style={styles.maxH54Px}>
            <Image
              style={[
                styles.p1_5,
                styles.roundedFull,
                // styles.border,
                // player.isPresent
                //   ? styles.borderGreenAccent
                //   : styles.borderGray300,
                styles.aspect1,
                styles.flexShrink,
              ]}
              source={icon}
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
      <RoomTurnProgress
        disabled={!triviaIsPresent(room.state)}
        durationMillis={
          triviaIsPresent(room.state) ? room.state.durationMillis : 1
        }
        deadline={triviaIsPresent(room.state) ? room.state.deadline : 1}
      />
    </View>
  );
}
