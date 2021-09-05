import React, { useRef, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Accelerometer } from 'expo-sensors';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Subscription } from '@unimodules/core';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewProps,
} from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

const lutDeg: number[] = [];
const lutTan: number[] = [];
for (let i = 0; i < 90; i++) {
  lutTan.push(Math.tan((Math.PI * i) / 180));
  lutDeg.push(i);
}

function binarySearch(
  array: number[],
  key: number,
  missBehavior: 'roll-forward' | 'roll-backward' = 'roll-forward'
) {
  let left = 0;
  let right = array.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    const midEl = array[mid];
    if (key < midEl) {
      right = mid - 1;
    } else if (key > midEl) {
      left = mid + 1;
    } else {
      return mid;
    }
  }
  // left and right crossed over.
  // left is guaranteed to be the lowest index with value > key
  if (missBehavior === 'roll-forward') {
    return Math.min(left, array.length - 1);
  } else {
    return Math.max(left - 1, 0);
  }
}

function fastAtan(y: number, x: number) {
  if (x === 0) {
    return Math.sign(y) * 90;
  }
  const ratio = y / x;
  return Math.sign(ratio) * lutDeg[binarySearch(lutTan, Math.abs(ratio))];
}

enum GameState {
  NOT_LEVEL = 'NOT_LEVEL',
  READY = 'READY',
  QUESTION = 'QUESTION',
  FEEDBACK = 'FEEDBACK',
  FEEDBACK_NOT_LEVEL = 'FEEDBACK_NOT_LEVEL',
  FINISHED = 'FINISHED',
}

type GameData = number;

type GameScreenProps = {
  topic: string;
  gameData: GameData;
  setGameData: (val: GameData) => void;
  exitGame: (finished: boolean) => void;
};

function GameScreen({
  topic,
  gameData,
  setGameData,
  exitGame,
}: GameScreenProps) {
  const [gameState, setGameState] = useState(GameState.NOT_LEVEL);
  const [accel, setAccel] = useState({
    x: 0,
    y: 0,
    z: 0,
  });
  const accelSubscription = useRef<Subscription>();
  const [bgColor, setBgColor] = useState('#ffffff');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Accelerometer.setUpdateInterval(16);
    accelSubscription.current = Accelerometer.addListener((newData) => {
      setAccel(newData);
    });

    return () => {
      if (accelSubscription.current) {
        accelSubscription.current.remove();
      }
    };
  }, []);

  const angle = fastAtan(accel.z, accel.x);
  useEffect(() => {
    switch (gameState) {
      case GameState.NOT_LEVEL:
      case GameState.FEEDBACK_NOT_LEVEL:
        if (angle >= -20 && angle <= 10) {
          setGameState(GameState.QUESTION);
        }
        break;
      case GameState.QUESTION:
        if (angle <= -60) {
          setGameState(GameState.FEEDBACK);
          setGameData(gameData + 1);
          setBgColor('#33ff99');
          fadeAnim.setValue(1);
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          }).start(() =>
            setGameState(
              angle >= -20 && angle <= 10
                ? GameState.QUESTION
                : GameState.FEEDBACK_NOT_LEVEL
            )
          );
        } else if (angle >= 50) {
          setGameState(GameState.FEEDBACK);
          setBgColor('#fcd34d');
          fadeAnim.setValue(1);
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          }).start(() =>
            setGameState(
              angle >= -20 && angle <= 10
                ? GameState.QUESTION
                : GameState.FEEDBACK_NOT_LEVEL
            )
          );
        }
        break;
      default:
        break;
    }
  }, [angle, fadeAnim, gameData, gameState, setGameData, setGameState]);

  return (
    <>
      <Animated.View
        style={[
          styles.inset0,
          styles.absolute,
          { backgroundColor: bgColor, opacity: fadeAnim },
        ]}
      />
      <View style={[styles.row, styles.p2]}>
        <Text>{topic}</Text>
        <Text>{gameData}</Text>
      </View>
      <View style={styles.container}>
        <Text style={styles.text3Xl}>{angle}°</Text>
      </View>
      <View style={[styles.row, styles.p2]}>
        <TouchableOpacity
          style={[styles.bgRed, styles.p2]}
          onLongPress={() => exitGame(false)}
        >
          <Text style={styles.textWhite}>HOLD TO QUIT</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

enum SelectionState {
  NONE,
  SELECTED,
}

function randomColor(x: number, l2: number) {
  let h = (511 * (x + 31) * (x + 31) + 3 * (x - 31)) % 360;
  if (h > 60 && h < 105) {
    h += 120;
  }
  const s = ((767 * (h + 32) * h) % 400) / 8 + l2 / 2;
  const l = l2 - 15 + Math.min(20, Math.abs(h - 120) / 3);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export default function App() {
  const [selectionState, setSelectionState] = useState(SelectionState.NONE);
  const [topic, setTopic] = useState<string>();
  const topicList = [
    'Music',
    'Movies',
    'THANK YOU! This is exactly what I was hoping for but I never knew it existed',
    ...Array(25)
      .fill(0)
      .map((_, j) => String(j + 4)),
  ];

  useEffect(() => {
    if (selectionState === SelectionState.NONE && topic !== undefined) {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE_LEFT
      ).then(
        () => setSelectionState(SelectionState.SELECTED),
        (err) => {
          console.error(err);
          setTopic(undefined);
        }
      );
    }
  }, [selectionState, topic]);

  return (
    <View style={styles.topContainer}>
      {selectionState === SelectionState.NONE ? (
        <FlatList
          numColumns={3}
          data={topicList}
          contentContainerStyle={styles.m4}
          keyExtractor={(item) => item}
          renderItem={({ item, index }) => (
            <View style={[styles.flexBasisOneThird]}>
              <TouchableOpacity
                onPress={() => setTopic(item)}
                style={[styles.button, styles.p2]}
              >
                <Svg width={'100%'} height={'100%'} style={[styles.absolute]}>
                  <Defs>
                    <LinearGradient id="grad" x1={0} y1={0} x2={0.5} y2={1}>
                      <Stop
                        offset={0}
                        stopColor={randomColor(2 * index, 50)}
                        stopOpacity={1}
                      />
                      <Stop
                        offset={1}
                        stopColor={randomColor(2 * index, 10)}
                        stopOpacity={1}
                      />
                    </LinearGradient>
                  </Defs>
                  <Rect
                    x={0}
                    y={0}
                    width={'100%'}
                    height={'100%'}
                    rx={8}
                    fill="url(#grad)"
                  />
                </Svg>
                <Text
                  style={[styles.textCenter, styles.textLg, styles.textWhite]}
                >
                  {item.toLocaleUpperCase()}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      ) : null}
      {selectionState === SelectionState.SELECTED && topic !== undefined ? (
        <GameScreen
          topic={topic}
          gameData={0}
          setGameData={() => {}}
          exitGame={() => {
            ScreenOrientation.lockAsync(
              ScreenOrientation.OrientationLock.DEFAULT
            );
            setTopic(undefined);
            setSelectionState(SelectionState.NONE);
          }}
        />
      ) : null}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  topContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    height: 150,
    flexGrow: 0,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: 20,
  },
  itemsStretch: {
    alignItems: 'stretch',
  },
  flexBasisOneThird: {
    flexBasis: '33.33%',
  },
  absolute: {
    position: 'absolute',
  },
  bgRed: {
    backgroundColor: '#f44',
  },
  inset0: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  p2: {
    padding: 8,
  },
  m4: {
    margin: 16,
  },
  space4: {
    height: 16,
    width: 16,
  },
  textCenter: {
    textAlign: 'center',
  },
  textLg: {
    fontSize: 20,
  },
  text3Xl: {
    fontSize: 48,
  },
  textWhite: {
    color: '#fff',
  },
  wFull: {
    width: '100%',
  },
  hFull: {
    height: '100%',
  },
});
