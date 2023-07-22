import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import Slider from '@react-native-community/slider';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StackActions } from '@react-navigation/native';
import { useNavigationTyped, useRouteTyped } from '../helpers/navigation';
import { Deck } from '../helpers/api';
import { styles } from '../styles';
import { ExpandingInfoHeader } from './ExpandingInfoHeader';
import { FormattedRelativeDate } from './FormattedRelativeDate';
import { RestClientContext } from './RestClientProvider';

const gameLengthOptions = [1, 30, 60, 90, 120];

export function GameCustomizationScreen() {
  const { client, logger } = useContext(RestClientContext);
  const [gameLength, setGameLength] = useState(60);
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
        setDeck(await client.inspectADeck(topic));
        setCategoryFrequencies({});
      } catch (err) {
        logger.error(err);
        console.error(err);
      }
    };
    get();
  }, [client, logger, topic]);

  const topicRef = useRef<number | null>(topic);
  useEffect(() => {
    topicRef.current = topic;

    return () => {
      topicRef.current = null;
    };
  }, [topic]);
  const getCards = async () => {
    try {
      const game = await client.createGame(
        topic,
        difficulty,
        categoryFrequencies
      );
      if (topicRef.current === topic) {
        if (!game.cards.length) {
          navigation.goBack();
        } else {
          navigation.dispatch(
            StackActions.replace('Game', {
              ...game,
              gameLength,
              title: deck?.title,
            })
          );
        }
      }
    } catch (err) {
      logger.error(err);
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
            percentage: ((100 * e.count) / deck.numEnabledCards).toFixed(0),
          }))
          .reduce((acc, cur) => (cur.count > acc.count ? cur : acc))
      : null;

  return (
    <SafeAreaView style={styles.topContainer}>
      <ScrollView contentContainerStyle={styles.allowFab}>
        <View style={[styles.m4]}>
          <Text style={[styles.textXl, styles.fontBold]}>
            {deck?.title ?? ''}
          </Text>
          {deck && (
            <Text>
              Last updated:{' '}
              <FormattedRelativeDate dateString={deck.updatedAt + 'Z'} />
            </Text>
          )}
        </View>
        <ExpandingInfoHeader
          style={[styles.row, styles.m4]}
          title="Difficulty"
          onPress={() =>
            setInformationOpen(
              informationOpen === 'difficulty' ? undefined : 'difficulty'
            )
          }
          infoVisible={informationOpen === 'difficulty'}
        >
          This deck can be configured to show well-known cards more often than
          average cards (negative numbers), or obscure cards more often than
          average cards (positive numbers).
        </ExpandingInfoHeader>
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
            <ExpandingInfoHeader
              style={[styles.row, styles.m4, styles.mt8]}
              title="Categories"
              onPress={() =>
                setInformationOpen(
                  informationOpen === 'categories' ? undefined : 'categories'
                )
              }
              infoVisible={informationOpen === 'categories'}
            >
              The most common category in the deck is {largestCategory?.name} (
              {largestCategory?.percentage}%), but you can turn the chances up
              or down for any category below.
            </ExpandingInfoHeader>
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
        <View style={[styles.row, styles.m4, styles.mt8]}>
          <Text style={[styles.textLg, styles.fontBold]}>Length</Text>
        </View>
        <View
          style={[
            styles.row,
            styles.justifySpaceAround,
            styles.mx4,
            styles.mb16,
          ]}
        >
          {gameLengthOptions.map((len) => (
            <TouchableOpacity
              key={len}
              style={
                len === gameLength
                  ? [styles.roundedMd, styles.p2, styles.bgBlue]
                  : [styles.roundedMd, styles.p2]
              }
              onPress={() => setGameLength(len)}
            >
              <Text
                style={
                  len === gameLength ? [styles.textWhite] : [styles.textBlue]
                }
              >
                {len}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
    </SafeAreaView>
  );
}
