import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
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
} from 'react-native';

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

enum GameStage {
  NOT_LEVEL = 'NOT_LEVEL',
  READY = 'READY',
  QUESTION = 'QUESTION',
  FEEDBACK = 'FEEDBACK',
  FEEDBACK_NOT_LEVEL = 'FEEDBACK_NOT_LEVEL',
  FINISHED = 'FINISHED',
}

function shouldShowTimer(gs: GameStage) {
  return gs !== GameStage.NOT_LEVEL && gs !== GameStage.FINISHED;
}

function timerFormat(gs: GameStage, secondsLeft: number) {
  if (gs === GameStage.READY) {
    return (secondsLeft - 60).toString();
  }
  const minutePart = Math.floor(secondsLeft / 60);
  const secondPart = (secondsLeft % 60).toString().padStart(2, '0');
  return `${minutePart > 0 ? minutePart : ''}:${secondPart}`;
}

function isAngleNeutral(angle: number) {
  return angle >= -10 && angle <= 20;
}

function isAngleDown(angle: number) {
  return angle <= -50;
}

function isAngleUp(angle: number) {
  return angle >= 60;
}

type GameState = {
  stage: GameStage;
  question: {
    label: string;
  };
  previousAnswered: boolean | undefined;
};

type GameData = {
  label: string;
  answered: boolean;
}[];

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
  const sounds = useRef({
    confirm: new Audio.Sound(),
    skip: new Audio.Sound(),
  }).current;
  const [gameState, setGameState] = useState<GameState>({
    stage: GameStage.NOT_LEVEL,
    question: {
      label: 'question 1',
    },
    previousAnswered: undefined,
  });
  const switchStage = useCallback(
    (gs: GameStage) => setGameState((val) => ({ ...val, stage: gs })),
    []
  );
  const [startTime, setStartTime] = useState(0);
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

  const angle = fastAtan(-accel.z, accel.x);
  const elapsed = Date.now() - startTime;
  const secondsLeft = Math.ceil(60 - elapsed / 1000);
  useEffect(() => {
    switch (gameState.stage) {
      case GameStage.NOT_LEVEL:
        if (isAngleNeutral(angle)) {
          switchStage(GameStage.READY);
          setStartTime(Date.now() + 3000);
        }
        break;
      case GameStage.READY:
        if (secondsLeft <= 60) {
          switchStage(GameStage.QUESTION);
        }
        break;
      case GameStage.QUESTION:
        const skipped = isAngleUp(angle);
        const confirmed = isAngleDown(angle);
        if (skipped || confirmed) {
          setGameState({
            ...gameState,
            stage: GameStage.FEEDBACK,
            previousAnswered: confirmed,
          });
          setGameData([
            ...gameData,
            { label: gameState.question.label, answered: confirmed },
          ]);
          setBgColor(confirmed ? '#33ff99' : '#fcd34d');
          fadeAnim.setValue(1);
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          }).start(() => switchStage(GameStage.FEEDBACK_NOT_LEVEL));
        }
        break;
      case GameStage.FEEDBACK:
        break;
      case GameStage.FEEDBACK_NOT_LEVEL:
        if (isAngleNeutral(angle)) {
          setGameState({
            ...gameState,
            stage: GameStage.QUESTION,
            question: {
              label: `question ${Math.floor(100 * Math.random() + 1)}`,
            },
          });
        }
        break;
      case GameStage.FINISHED:
        break;
      default:
        break;
    }
    if (secondsLeft < 0 && gameState.stage !== GameStage.NOT_LEVEL) {
      switchStage(GameStage.FINISHED);
    }
  }, [
    angle,
    exitGame,
    fadeAnim,
    gameData,
    gameState,
    secondsLeft,
    setGameData,
    setGameState,
    switchStage,
  ]);

  useEffect(() => {
    if (gameState.stage !== GameStage.FEEDBACK) {
      return;
    }
    let shouldPlay = true;
    const soundEffect = async () => {
      if (gameState.previousAnswered) {
        await sounds.confirm.loadAsync(require('./assets/YES.wav'));
        if (shouldPlay) {
          await sounds.confirm.playAsync();
        }
      } else {
        await sounds.skip.loadAsync(require('./assets/BeOS-ScrubAlert.aiff'));
        if (shouldPlay) {
          await sounds.skip.playAsync();
        }
      }
    };

    soundEffect();
    if (gameState.previousAnswered) {
      return () => {
        sounds.confirm.unloadAsync();
      };
    }
    return () => {
      sounds.skip.unloadAsync();
    };
  }, [gameState.previousAnswered, gameState.stage, sounds]);

  let mainText = 'HOLD UP TO YOUR FOREHEAD';
  const { stage } = gameState;
  switch (stage) {
    case GameStage.READY:
      mainText = 'GET READY. . .';
      break;
    case GameStage.QUESTION:
    case GameStage.FEEDBACK:
      mainText = gameState.question.label;
      break;
    case GameStage.FEEDBACK_NOT_LEVEL:
      mainText = 'HOLD PHONE LEVEL';
      break;
    case GameStage.FINISHED:
      mainText = '';
      break;
    default:
      break;
  }

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
        <Text>
          {gameData.reduce((a, curr) => a + (curr.answered ? 1 : 0), 0)}
        </Text>
      </View>
      <View style={styles.container}>
        {stage === GameStage.FINISHED ? (
          <View style={styles.itemsCenter}>
            {gameData.map((item) => (
              <Text
                style={
                  item.answered
                    ? [styles.textMd]
                    : [styles.textRed, styles.textMd]
                }
              >
                {item.label}
              </Text>
            ))}
            <TouchableOpacity
              style={[styles.bgBlue, styles.p2, styles.mt4]}
              onPress={() => exitGame(true)}
            >
              <Text style={styles.textWhite}>TAP TO RETURN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.text3Xl}>{mainText}</Text>
        )}
      </View>
      <View style={[styles.row, styles.p2]}>
        <View
          style={[styles.row, styles.flexBasisOneThird, styles.justifyStart]}
        >
          {stage !== GameStage.FINISHED && (
            <TouchableOpacity
              style={[styles.bgRed, styles.p2]}
              onLongPress={() => exitGame(false)}
            >
              <Text style={styles.textWhite}>HOLD TO QUIT</Text>
            </TouchableOpacity>
          )}
        </View>
        <View
          style={[styles.row, styles.flexBasisOneThird, styles.justifyCenter]}
        >
          {shouldShowTimer(stage) && (
            <Text style={styles.textXl}>{timerFormat(stage, secondsLeft)}</Text>
          )}
        </View>
        <View style={styles.flexBasisOneThird} />
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
  const [gameData, setGameData] = useState<GameData>([]);
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
        () => {
          setGameData([]);
          setSelectionState(SelectionState.SELECTED);
        },
        (err) => {
          console.error(err);
          setTopic(undefined);
        }
      );
    }
  }, [selectionState, topic]);

  return (
    <View style={styles.topContainer}>
      {selectionState === SelectionState.NONE && (
        <FlatList
          numColumns={3}
          ListHeaderComponent={
            <View style={[styles.row, styles.justifyCenter]}>
              <Text
                style={[
                  styles.mt8,
                  styles.mb4,
                  styles.textLg,
                  styles.fontWeightBold,
                ]}
              >
                Decks
              </Text>
            </View>
          }
          data={topicList}
          contentContainerStyle={styles.m4}
          keyExtractor={(item) => item}
          renderItem={({ item, index }) => (
            <View style={[styles.p2, styles.flexBasisOneThird]}>
              <TouchableOpacity
                onPress={() => setTopic(item)}
                style={[
                  styles.button,
                  styles.p2,
                  { backgroundColor: randomColor(2 * index, 30) },
                ]}
              >
                <Text
                  numberOfLines={5}
                  style={[styles.textCenter, styles.textLg, styles.textWhite]}
                >
                  {item.toLocaleUpperCase()}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
      {selectionState === SelectionState.SELECTED && topic !== undefined && (
        <GameScreen
          topic={topic}
          gameData={gameData}
          setGameData={setGameData}
          exitGame={() => {
            ScreenOrientation.lockAsync(
              ScreenOrientation.OrientationLock.DEFAULT
            );
            setTopic(undefined);
            setSelectionState(SelectionState.NONE);
          }}
        />
      )}
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
  },
  itemsCenter: {
    alignItems: 'center',
  },
  itemsStretch: {
    alignItems: 'stretch',
  },
  itemsEnd: {
    alignItems: 'flex-end',
  },
  justifyStart: {
    justifyContent: 'flex-start',
  },
  justifyCenter: {
    justifyContent: 'center',
  },
  flexBasisOneThird: {
    flex: 1, //: '33.33%',
  },
  absolute: {
    position: 'absolute',
  },
  bgBlue: {
    backgroundColor: '#1D4ED8',
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
  mt4: {
    marginTop: 16,
  },
  mb4: {
    marginBottom: 16,
  },
  m4: {
    margin: 16,
  },
  mt8: {
    marginTop: 32,
  },
  space4: {
    height: 16,
    width: 16,
  },
  textCenter: {
    textAlign: 'center',
  },
  textMd: {
    fontSize: 16,
  },
  textLg: {
    fontSize: 20,
  },
  textXl: {
    fontSize: 28,
  },
  text3Xl: {
    fontSize: 48,
  },
  textWhite: {
    color: '#fff',
  },
  textRed: {
    color: '#DC2626',
  },
  fontWeightBold: {
    fontWeight: 'bold',
  },
  wFull: {
    width: '100%',
  },
  hFull: {
    height: '100%',
  },
});
