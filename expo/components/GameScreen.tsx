import React, {
  useRef,
  useState,
  useReducer,
  useEffect,
  useCallback,
  useContext,
} from 'react';
import { Audio } from 'expo-av';
import { Accelerometer, ThreeAxisMeasurement } from 'expo-sensors';
import { Subscription } from 'expo-modules-core';
import {
  Animated,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  GameStage,
  shouldShowTimer,
  timerFormat,
  shouldRunTimer,
  isAngleUp,
  isAngleNeutral,
  isAngleDown,
} from '../helpers/gameLogic';
import { useNavigationTyped, useRouteTyped } from '../helpers/navigation';
import { Card } from '../helpers/api';
import { RestClientContext } from './RestClientProvider';
import { styles } from '../styles';

export type GameData = {
  id: number;
  title: string;
  answered: boolean;
}[];

export type GameState = {
  stage: GameStage;
  cards: Card[];
  history: GameData;
  gameLength: number;
  readyCountdown: number;
  inFinalSeconds: boolean;
  timerDisplay: string;
  previousAnswered: boolean | undefined;
};

type GameStateAction =
  | {
      kind: 'set-state';
      data: (val: GameState) => GameState;
    }
  | {
      kind: 'accel';
      data: ThreeAxisMeasurement;
    }
  | {
      kind: 'timer';
      data: number;
    };

function gameStateReducer(
  state: GameState,
  action: GameStateAction
): GameState {
  if (action.kind === 'set-state') {
    return action.data(state);
  }
  if (action.kind === 'accel') {
    const accel = action.data;
    switch (state.stage) {
      case GameStage.NOT_LEVEL:
        if (isAngleNeutral(accel)) {
          return { ...state, stage: GameStage.READY };
        }
        return state;
      case GameStage.QUESTION:
        const skipped = isAngleUp(accel);
        const confirmed = isAngleDown(accel);
        if (skipped || confirmed) {
          const question = state.cards.length ? state.cards[0] : null;
          let history = state.history;
          if (question) {
            history = [
              ...history,
              { id: question.id, title: question.title, answered: confirmed },
            ];
          }
          return {
            ...state,
            stage: GameStage.FEEDBACK,
            previousAnswered: confirmed,
            history,
          };
        }
        return state;
      case GameStage.FEEDBACK_NOT_LEVEL:
        const isDone = state.cards.length === 1;
        if (isDone || isAngleNeutral(accel)) {
          return {
            ...state,
            stage: isDone ? GameStage.FINISHED : GameStage.QUESTION,
            cards: state.cards.slice(1),
          };
        }
        return state;
      default:
        return state;
    }
  }
  if (action.kind === 'timer') {
    const elapsed = action.data - 3;
    const timerDisplay = timerFormat(state.stage, state.gameLength, elapsed);
    if (state.timerDisplay !== timerDisplay) {
      return gameStateReducer({ ...state, timerDisplay }, action);
    }
    if (elapsed >= state.gameLength) {
      const question = state.cards.length ? state.cards[0] : null;
      let history = state.history;
      if (question && state.stage === GameStage.QUESTION) {
        history = [
          ...history,
          { id: question.id, title: question.title, answered: false },
        ];
      }
      return { ...state, stage: GameStage.FINISHED, history };
    }
    if (state.stage === GameStage.READY) {
      const seconds = Math.floor(elapsed);
      if (seconds === 0) {
        return { ...state, stage: GameStage.QUESTION, readyCountdown: 0 };
      } else if (seconds !== state.readyCountdown) {
        return { ...state, readyCountdown: seconds };
      }
    }
    if (
      state.gameLength >= 20 &&
      !state.inFinalSeconds &&
      state.gameLength - elapsed <= 10
    ) {
      return { ...state, inFinalSeconds: true };
    }
    return state;
  }
  throw new Error('Unhandled action type');
}

function useGameState(
  cards: Card[],
  gameLength: number,
  isSoundReady: boolean
) {
  const [gameState, dispatch] = useReducer(gameStateReducer, {
    stage: GameStage.NOT_LEVEL,
    history: [],
    cards,
    gameLength,
    readyCountdown: -4,
    inFinalSeconds: false,
    timerDisplay: '',
    previousAnswered: undefined,
  });
  const setGameState = useCallback(
    (action: (state: GameState) => GameState) => {
      dispatch({ kind: 'set-state', data: action });
    },
    []
  );
  const timerRef = useRef<number>();
  const willRunTimer = shouldRunTimer(gameState.stage);
  useEffect(() => {
    if (!willRunTimer || !isSoundReady) {
      return;
    }
    const startTime = Date.now();
    timerRef.current = setInterval(
      () => dispatch({ kind: 'timer', data: (Date.now() - startTime) / 1000 }),
      16
    ) as any;

    return () => {
      clearInterval(timerRef.current);
    };
  }, [isSoundReady, willRunTimer]);

  useEffect(() => {
    setGameState(() => ({
      stage: GameStage.NOT_LEVEL,
      history: [],
      cards,
      gameLength,
      readyCountdown: -4,
      inFinalSeconds: false,
      timerDisplay: '',
      previousAnswered: undefined,
    }));
  }, [cards, gameLength, setGameState]);

  const accelSubscription = useRef<Subscription>();
  useEffect(() => {
    Accelerometer.setUpdateInterval(16);
    if (!isSoundReady) {
      return;
    }
    accelSubscription.current = Accelerometer.addListener((rawData) => {
      let data = rawData;
      // Android's accelerometer is backwards, e.g. z is +9.8 when the device is face up
      // Fix was never merged: https://github.com/expo/expo/pull/3277
      if (Platform.OS === 'android') {
        data = { x: -data.x, y: -data.y, z: -data.z };
      }
      dispatch({ kind: 'accel', data });
    });

    return () => {
      if (accelSubscription.current) {
        accelSubscription.current.remove();
      }
    };
  }, [isSoundReady]);

  return {
    gameState,
    setGameState,
  };
}

export function GameScreen() {
  const { logger } = useContext(RestClientContext);
  const navigation = useNavigationTyped();
  const {
    params: { deck, cards: propCards, gameLength },
  } = useRouteTyped<'Game'>();
  const [isSoundReady, setSoundReady] = useState(false);
  const sounds = useRef({
    ready: new Audio.Sound(),
    start: new Audio.Sound(),
    confirm: new Audio.Sound(),
    skip: new Audio.Sound(),
    finalSeconds: new Audio.Sound(),
    finish: new Audio.Sound(),
  }).current;
  useEffect(() => {
    const loadAll = async () => {
      try {
        await Promise.all([
          sounds.ready.loadAsync(require('../assets/ready.wav')),
          sounds.start.loadAsync(require('../assets/start.wav')),
          sounds.confirm.loadAsync(require('../assets/YES.wav')),
          sounds.skip.loadAsync(require('../assets/BeOS-ScrubAlert.wav')),
          sounds.finalSeconds.loadAsync(require('../assets/final_seconds.wav')),
          sounds.finish.loadAsync(require('../assets/finish.wav')),
        ]);
      } catch (err) {
        logger.error(err);
        console.error(err);
      } finally {
        setSoundReady(true);
      }
    };

    const unloadAll = async () => {
      try {
        await Promise.all([
          sounds.confirm.unloadAsync(),
          sounds.skip.unloadAsync(),
        ]);
      } catch (err) {
        logger.error(err);
        console.error(err);
      }
    };

    loadAll();
    return () => {
      unloadAll();
    };
  }, [logger, sounds]);
  const { gameState, setGameState } = useGameState(
    propCards,
    gameLength,
    isSoundReady
  );
  const switchStageChecked = useCallback(
    (prev: GameStage, gs: GameStage) =>
      setGameState((val) => {
        if (val.stage === prev) {
          return { ...val, stage: gs };
        }
        return val;
      }),
    [setGameState]
  );
  const [bgColor, setBgColor] = useState('#ffffff');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (gameState.stage === GameStage.FEEDBACK) {
      const confirmed = gameState.previousAnswered;
      setBgColor(confirmed ? '#33ff99' : '#fcd34d');
      fadeAnim.setValue(1);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: false,
      }).start(() =>
        switchStageChecked(GameStage.FEEDBACK, GameStage.FEEDBACK_NOT_LEVEL)
      );
    }
  }, [
    fadeAnim,
    gameState.stage,
    gameState.previousAnswered,
    switchStageChecked,
  ]);
  const [qNotLevelText, setQNotLevelText] = useState('');
  useEffect(() => {
    if (gameState.stage === GameStage.FEEDBACK_NOT_LEVEL) {
      // delay by one render so that this doesn't always show up
      setQNotLevelText('HOLD PHONE LEVEL');
    } else {
      setQNotLevelText('');
    }
  }, [gameState.stage]);

  useEffect(() => {
    const soundEffect = async () => {
      try {
        if (gameState.stage === GameStage.FEEDBACK) {
          if (gameState.previousAnswered) {
            await sounds.confirm.replayAsync();
          } else {
            await sounds.skip.replayAsync();
          }
        }
      } catch (err) {
        logger.error(err);
        console.error(err);
      }
    };

    soundEffect();
  }, [gameState.stage, gameState.previousAnswered, logger, sounds]);
  useEffect(() => {
    const soundEffect = async () => {
      if (gameState.stage === GameStage.FINISHED) {
        try {
          await sounds.finish.replayAsync();
        } catch (err) {
          logger.error(err);
          console.error(err);
        }
      }
    };

    soundEffect();
  }, [gameState.stage, logger, sounds]);
  useEffect(() => {
    if (gameState.readyCountdown < -3) {
      return;
    }
    const soundEffect = async () => {
      try {
        if (gameState.readyCountdown < 0) {
          await sounds.ready.replayAsync();
        } else {
          await sounds.start.replayAsync();
        }
      } catch (err) {
        logger.error(err);
        console.error(err);
      }
    };

    soundEffect();
  }, [gameState.readyCountdown, logger, sounds]);
  useEffect(() => {
    if (!gameState.inFinalSeconds) {
      return;
    }
    const soundEffect = async () => {
      try {
        await sounds.finalSeconds.replayAsync();
      } catch (err) {
        logger.error(err);
        console.error(err);
      }
    };

    soundEffect();
  }, [gameState.inFinalSeconds, logger, sounds]);

  let mainText = 'HOLD UP TO YOUR FOREHEAD';
  const { stage } = gameState;
  switch (stage) {
    case GameStage.READY:
      mainText = 'GET READY. . .';
      break;
    case GameStage.QUESTION:
    case GameStage.FEEDBACK:
      mainText = gameState.cards[0].title;
      break;
    case GameStage.FEEDBACK_NOT_LEVEL:
      mainText = qNotLevelText;
      break;
    case GameStage.FINISHED:
      mainText = '';
      break;
    default:
      break;
  }

  const mainTextFontSize =
    Math.max(...mainText.split('\n').map((line) => line.length)) <= 60
      ? styles.text3Xl
      : styles.text2Xl;
  const score = gameState.history.reduce(
    (a, curr) => a + (curr.answered ? 1 : 0),
    0
  );
  return (
    <View style={styles.topContainer}>
      <Animated.View
        style={[
          styles.inset0,
          styles.absolute,
          { backgroundColor: bgColor, opacity: fadeAnim },
        ]}
      />
      {stage === GameStage.FINISHED ? (
        <ScrollView contentContainerStyle={[styles.itemsCenter, styles.mt2]}>
          <Text style={[styles.textLg, styles.m4]}>{score}</Text>
          {gameState.history.map((item) => (
            <Text
              key={item.id}
              style={
                item.answered
                  ? [styles.textMd]
                  : [styles.textRed, styles.textMd]
              }
            >
              {item.title.replace(/\n/g, ' ⸺ ')}
            </Text>
          ))}
          <TouchableOpacity
            style={[styles.bgBlue, styles.p2, styles.mt4, styles.mb8]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.textWhite}>TAP TO RETURN</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <View style={[styles.row, styles.p4]}>
            <Text>{deck.title}</Text>
            <Text>{score}</Text>
          </View>
          <View style={[styles.container, styles.mx4]}>
            <Text style={[mainTextFontSize, styles.textCenter]}>
              {mainText}
            </Text>
          </View>
          <View style={[styles.row, styles.p2]}>
            <View
              style={[
                styles.row,
                styles.flexBasisOneThird,
                styles.justifyStart,
              ]}
            >
              <TouchableOpacity
                style={[styles.bgRed, styles.p2]}
                onLongPress={() => navigation.goBack()}
              >
                <Text style={styles.textWhite}>HOLD TO QUIT</Text>
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.row,
                styles.flexBasisOneThird,
                styles.justifyCenter,
              ]}
            >
              {shouldShowTimer(stage) && (
                <Text style={styles.textXl}>{gameState.timerDisplay}</Text>
              )}
            </View>
            <View style={styles.flexBasisOneThird} />
          </View>
        </>
      )}
    </View>
  );
}
