import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Accelerometer } from 'expo-sensors';
import { Subscription } from '@unimodules/core';
import {
  Animated,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  GameStage,
  shouldShowTimer,
  timerFormat,
  isAngleUp,
  isAngleNeutral,
  isAngleDown,
  shouldRunTimer,
} from '../helpers/gameLogic';
import { styles } from '../styles';
import { useNavigationTyped, useRouteTyped } from '../helpers/navigation';
import { Card } from '../helpers/api';

export type GameState = {
  stage: GameStage;
  cards: Card[];
  previousAnswered: boolean | undefined;
};

export type GameData = {
  id: number;
  title: string;
  answered: boolean;
}[];

export function GameScreen() {
  const navigation = useNavigationTyped();
  const {
    params: { deck, cards: propCards, gameLength },
  } = useRouteTyped<'Game'>();
  const [gameData, setGameData] = useState<GameData>([]);

  const sounds = useRef({
    confirm: new Audio.Sound(),
    skip: new Audio.Sound(),
  }).current;
  useEffect(() => {
    const loadAll = async () => {
      try {
        await Promise.all([
          sounds.confirm.loadAsync(require('../assets/YES.wav')),
          sounds.skip.loadAsync(require('../assets/BeOS-ScrubAlert.aiff')),
        ]);
      } catch (err) {
        console.error(err);
      }
    };

    const unloadAll = async () => {
      try {
        await Promise.all([
          sounds.confirm.unloadAsync(),
          sounds.skip.unloadAsync(),
        ]);
      } catch (err) {
        console.error(err);
      }
    };

    loadAll();
    return () => {
      unloadAll();
    };
  }, [sounds]);
  const [gameState, setGameState] = useState<GameState>({
    stage: GameStage.NOT_LEVEL,
    cards: propCards,
    previousAnswered: undefined,
  });
  const switchStage = useCallback(
    (gs: GameStage) => setGameState((val) => ({ ...val, stage: gs })),
    []
  );
  const switchStageChecked = useCallback(
    (prev: GameStage, gs: GameStage) =>
      setGameState((val) => {
        if (val.stage === prev) {
          return { ...val, stage: gs };
        }
        return val;
      }),
    []
  );
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(-3);
  const timerRef = useRef<number>();
  const willRunTimer = shouldRunTimer(gameState.stage);
  useEffect(() => {
    if (!willRunTimer) {
      return;
    }
    timerRef.current = setInterval(
      () => setElapsed((Date.now() - startTime) / 1000),
      16
    ) as any;

    return () => {
      clearInterval(timerRef.current);
    };
  }, [startTime, willRunTimer]);

  const [accel, setAccel] = useState({
    x: 0,
    y: 0,
    z: -1,
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

  useEffect(() => {
    setGameState({
      stage: GameStage.NOT_LEVEL,
      cards: propCards,
      previousAnswered: undefined,
    });
    setGameData([]);
  }, [propCards]);

  useEffect(() => {
    switch (gameState.stage) {
      case GameStage.NOT_LEVEL:
        if (isAngleNeutral(accel)) {
          switchStage(GameStage.READY);
          setStartTime(Date.now() + 3000);
        }
        break;
      case GameStage.READY:
        if (elapsed >= 0) {
          switchStage(GameStage.QUESTION);
        }
        break;
      case GameStage.QUESTION:
        const skipped = isAngleUp(accel);
        const confirmed = isAngleDown(accel);
        if (skipped || confirmed) {
          const question = gameState.cards.length ? gameState.cards[0] : null;
          setGameState((prev) => ({
            ...prev,
            stage: GameStage.FEEDBACK,
            previousAnswered: confirmed,
          }));
          if (question) {
            setGameData([
              ...gameData,
              { id: question.id, title: question.title, answered: confirmed },
            ]);
          }
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
        break;
      case GameStage.FEEDBACK:
        break;
      case GameStage.FEEDBACK_NOT_LEVEL:
        const isDone = gameState.cards.length === 1;
        if (isDone || isAngleNeutral(accel)) {
          setGameState((prev) => ({
            ...prev,
            stage: isDone ? GameStage.FINISHED : GameStage.QUESTION,
            cards: gameState.cards.slice(1),
          }));
        }
        break;
      case GameStage.FINISHED:
        return;
      default:
        break;
    }
    if (gameState.stage !== GameStage.NOT_LEVEL && elapsed > gameLength) {
      switchStage(GameStage.FINISHED);
      const question = gameState.cards.length ? gameState.cards[0] : null;
      if (question && gameState.stage === GameStage.QUESTION) {
        setGameData([
          ...gameData,
          { id: question.id, title: question.title, answered: false },
        ]);
      }
    }
  }, [
    accel,
    elapsed,
    fadeAnim,
    gameData,
    gameLength,
    gameState,
    setGameState,
    switchStage,
    switchStageChecked,
  ]);

  useEffect(() => {
    if (gameState.stage !== GameStage.FEEDBACK) {
      return;
    }
    const soundEffect = async () => {
      try {
        if (gameState.previousAnswered) {
          await sounds.confirm.playAsync();
        } else {
          await sounds.skip.playAsync();
        }
      } catch (err) {
        console.error(err);
      }
    };

    soundEffect();
  }, [gameState.previousAnswered, gameState.stage, sounds]);

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
      mainText = 'HOLD PHONE LEVEL';
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
          <Text style={[styles.textLg, styles.m4]}>
            {gameData.reduce((a, curr) => a + (curr.answered ? 1 : 0), 0)}
          </Text>
          {gameData.map((item) => (
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
            <Text>
              {gameData.reduce((a, curr) => a + (curr.answered ? 1 : 0), 0)}
            </Text>
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
                <Text style={styles.textXl}>
                  {timerFormat(stage, gameLength, elapsed)}
                </Text>
              )}
            </View>
            <View style={styles.flexBasisOneThird}>
              <Text>{Math.round((Math.asin(accel.z) * 180) / Math.PI)}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
