import React, { useState, useEffect, useMemo, useRef } from 'react';
import Slider from '@react-native-community/slider';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { useNavigationTyped, useRouteTyped } from '../helpers/navigation';
import { createGame, Deck, inspectADeck } from '../helpers/api';
import { styles } from '../styles';

export function GameCustomizationScreen() {
  const [deck, setDeck] = useState<Deck>();
  const [difficulty, setDifficulty] = useState(0);
  const [categoryFrequencies, setCategoryFrequencies] = useState<
    Record<string, number>
  >({});
  const [informationOpen, setInformationOpen] = useState<string>();
  const navigation = useNavigationTyped();
  const {
    params: { topic },
  } = useRouteTyped<'GameCustomization'>();

  useEffect(() => {
    const get = async () => {
      try {
        setDeck(await inspectADeck(topic));
        setCategoryFrequencies({});
      } catch (err) {
        console.error(err);
      }
    };
    get();
  }, [topic]);

  const topicRef = useRef<number | null>(topic);
  useEffect(() => {
    topicRef.current = topic;

    return () => {
      topicRef.current = null;
    };
  }, [topic]);
  const getCards = async () => {
    try {
      const game = await createGame(topic, difficulty);
      if (topicRef.current === topic) {
        navigation.dispatch(StackActions.replace('Game', game));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const categoryCounts = useMemo(() => {
    const arr = deck?.categoryCounts;
    return arr
      ? arr.filter((c) => c.name).sort((a, b) => (a.name < b.name ? 1 : -1))
      : [];
  }, [deck]);

  return (
    <View style={styles.topContainer}>
      <ScrollView>
        <View style={[styles.row, styles.m4]}>
          <Text style={[styles.textLg, styles.fontWeightBold]}>Difficulty</Text>
          <TouchableOpacity
            style={[styles.bgBlue, styles.iconBtn]}
            onPress={() =>
              setInformationOpen(
                informationOpen === 'difficulty' ? undefined : 'difficulty'
              )
            }
          >
            <Text style={[styles.textCenter, styles.textWhite]}>i</Text>
          </TouchableOpacity>
        </View>
        {informationOpen === 'difficulty' && (
          <View
            style={[
              styles.roundedLg,
              styles.mx4,
              styles.p4,
              styles.mb4,
              styles.bgPaperDarker,
            ]}
          >
            <Text>
              This deck can be configured to show well-known cards more often
              than average cards (negative numbers), or obscure cards more often
              than average cards (positive numbers).
            </Text>
          </View>
        )}
        <View style={[styles.row, styles.mx4]}>
          <Text>{difficulty.toFixed(1)}</Text>
          <Slider
            style={[styles.wHalf]}
            onValueChange={(val) => setDifficulty(val)}
            value={0}
            minimumValue={-10}
            maximumValue={10}
          />
        </View>
        {categoryCounts.length > 0 && (
          <>
            <View style={[styles.row, styles.m4, styles.mt8]}>
              <Text style={[styles.textLg, styles.fontWeightBold]}>
                Categories
              </Text>
              <TouchableOpacity
                style={[styles.bgBlue, styles.iconBtn]}
                onPress={() =>
                  setInformationOpen(
                    informationOpen === 'categories' ? undefined : 'categories'
                  )
                }
              >
                <Text style={[styles.textCenter, styles.textWhite]}>i</Text>
              </TouchableOpacity>
            </View>
            {informationOpen === 'categories' && (
              <View
                style={[
                  styles.roundedLg,
                  styles.mx4,
                  styles.p2,
                  styles.mb4,
                  styles.bgPaperDarker,
                ]}
              >
                <Text>This doesn't do anything yet.</Text>
              </View>
            )}
            {categoryCounts.map(({ name }) => (
              <View key={name} style={[styles.row, styles.mx4]}>
                <Text>
                  {name} ({(10 * (categoryFrequencies[name] ?? 0.5)).toFixed(1)}
                  )
                </Text>
                <Slider
                  style={[styles.wHalf]}
                  onValueChange={(val) =>
                    setCategoryFrequencies((obj) => ({ ...obj, [name]: val }))
                  }
                  value={0.5}
                  minimumValue={0}
                  maximumValue={1}
                />
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <View
        style={[
          styles.absolute,
          styles.right0,
          styles.bottom0,
          styles.pr4,
          styles.pb4,
        ]}
      >
        <TouchableOpacity
          style={[styles.bgBlue, styles.p2, styles.roundedMd]}
          onPress={getCards}
        >
          <Text style={[styles.textXl, styles.textWhite]}>PLAY</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
