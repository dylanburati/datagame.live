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
      const game = await createGame(topic, difficulty, categoryFrequencies);
      if (topicRef.current === topic) {
        navigation.dispatch(StackActions.replace('Game', game));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const categoryCounts = useMemo(() => {
    const arr = deck?.categoryCounts;
    return arr && deck?.canSelectCategories
      ? arr.filter((c) => c.name).sort((a, b) => (a.name < b.name ? 1 : -1))
      : [];
  }, [deck]);
  const largestCategory =
    categoryCounts.length && deck
      ? categoryCounts
          .map((e) => ({
            ...e,
            percentage: (100 * e.count) / deck.numEnabledCards,
          }))
          .reduce((acc, cur) => (cur.count > acc.count ? cur : acc))
      : null;

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
                <Text>
                  The most common category in the deck is{' '}
                  {largestCategory?.name} (
                  {largestCategory?.percentage.toFixed(0)}%), but you can turn
                  the chances up or down for any category below.
                </Text>
              </View>
            )}
            {categoryCounts.map(({ name }) => (
              <View key={name} style={[styles.row, styles.mx4]}>
                <Text>
                  {name} ({(categoryFrequencies[name] || 0).toFixed(1)})
                </Text>
                <Slider
                  style={[styles.wHalf]}
                  onValueChange={(val) =>
                    setCategoryFrequencies((obj) => ({ ...obj, [name]: val }))
                  }
                  value={0}
                  minimumValue={-10}
                  maximumValue={10}
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
