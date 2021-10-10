import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  lockAsync as lockOrientationAsync,
  OrientationLock,
} from 'expo-screen-orientation';
import { locales } from 'expo-localization';
import { ImageBackground, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GameScreen } from './components/GameScreen';
import { Loader } from './components/Loader';
import { GameCustomizationScreen } from './components/GameCustomizationScreen';
import { RootStackParamList, useNavigationTyped } from './helpers/navigation';
import { Deck, listDecks } from './helpers/api';
import { styles } from './styles';
import { Audio } from 'expo-av';
import {
  DataProvider,
  LayoutProvider,
  RecyclerListView,
} from 'recyclerlistview';
import { useSet, useWindowWidth } from './helpers/hooks';
import { IntlProvider } from 'react-intl';

function randomColor(x: number, l2: number) {
  let h = (511 * (x + 31) * (x + 31) + 3 * (x - 31)) % 360;
  if (h > 60 && h < 105) {
    h += 120;
  }
  const s = ((767 * (h + 32) * h) % 400) / 8 + l2 / 2;
  const l = l2 - 15 + Math.min(20, Math.abs(h - 120) / 3);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// const imageSources: Record<string, string> = {
//   Places: 'https://datagame.live/downloads/places.jpg',
//   'The Rich and Famous': 'https://datagame.live/downloads/people.jpg',
//   'Music / Billboard US': 'https://datagame.live/downloads/music.jpg',
//   Animals: 'https://datagame.live/downloads/animals.jpg',
//   Movies: 'https://datagame.live/downloads/movies.jpg',
// };

const Stack = createNativeStackNavigator<RootStackParamList>();

type DisplayDeck = {
  deck: Deck;
  hasImageLoaded: boolean;
};
const topicDataProvider = new DataProvider(
  (r1: DisplayDeck, r2: DisplayDeck) =>
    r1.deck.id !== r2.deck.id || r1.hasImageLoaded !== r2.hasImageLoaded
);

export function HomeScreen() {
  const [topicList, setTopicList] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(false);
  const { navigate } = useNavigationTyped();
  const retryRef = useRef<number>();
  const [retryCounter, setRetryCounter] = useState(1);
  const windowWidth = useWindowWidth();
  const { set: loadedImages, add: markImageLoaded } = useSet(new Set<number>());
  const displayDecks = useMemo(
    () =>
      topicList.map((deck) => ({
        deck,
        hasImageLoaded: loadedImages.has(deck.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedImages.size, topicList]
  );
  const dataProvider = useMemo(() => {
    return topicDataProvider.cloneWithRows(displayDecks);
  }, [displayDecks]);
  const layoutProvider = useMemo(() => {
    return new LayoutProvider(
      () => 0,
      (_type, dim) => {
        const containerWidth = windowWidth - 2 * styles.m4.margin;
        const denominator = [6, 5, 4, 3, 2].find(
          (n) => containerWidth / n >= 120
        );
        if (denominator === undefined) {
          dim.width = 0;
          dim.height = 0;
        } else {
          const padding = 2 * styles.p2.padding;
          dim.width = containerWidth / denominator;
          const imgWidth = dim.width - padding;
          dim.height = (imgWidth * 5) / 3;
        }
      }
    );
  }, [windowWidth]);

  useEffect(() => {
    const get = async () => {
      setLoading(true);
      try {
        setTopicList(await listDecks());
        setRetryCounter(0);
      } catch (err) {
        console.error(err);
        retryRef.current = setTimeout(
          () => setRetryCounter((n) => n + 1),
          1000 * Math.pow(1.6, retryCounter)
        ) as any;
      } finally {
        setLoading(false);
      }
    };
    if (retryCounter > 0) {
      get();
    }
  }, [retryCounter, retryRef]);

  useEffect(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
    }
  }, []);

  return (
    <View style={styles.topContainer}>
      {loading && topicList.length === 0 && <Loader />}
      {topicList.length > 0 && (
        <RecyclerListView
          layoutProvider={layoutProvider}
          dataProvider={dataProvider}
          scrollViewProps={{
            contentContainerStyle: [styles.m4, styles.pb16],
          }}
          canChangeSize={true}
          // keyExtractor={(item) => String(item.id)}
          rowRenderer={(
            _type,
            { deck, hasImageLoaded }: DisplayDeck,
            index
          ) => (
            <View style={[styles.p2]}>
              <TouchableOpacity
                onPress={() =>
                  navigate('GameCustomization', { topic: deck.id })
                }
                style={[styles.deckTile]}
              >
                <ImageBackground
                  style={[
                    styles.centerAll,
                    styles.wFull,
                    styles.hFull,
                    styles.p2,
                  ]}
                  imageStyle={[
                    styles.roundedMd,
                    {
                      backgroundColor:
                        deck.imageDominantColor || randomColor(2 * index, 30),
                    },
                  ]}
                  onLoad={() => markImageLoaded(deck.id)}
                  // resizeMode="contain"
                  source={{ uri: deck.imageUrl }}
                >
                  {!hasImageLoaded && (
                    <Text
                      numberOfLines={5}
                      style={[
                        styles.textCenter,
                        styles.textLg,
                        styles.textWhite,
                      ]}
                    >
                      {deck.title.toLocaleUpperCase()}
                    </Text>
                  )}
                </ImageBackground>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
    });
  }, []);

  return (
    <IntlProvider locale={locales[0]}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen
            name="Home"
            listeners={{
              focus: () => {
                lockOrientationAsync(OrientationLock.DEFAULT);
              },
            }}
            component={HomeScreen}
            options={{ orientation: 'default' }}
          />
          <Stack.Screen
            name="GameCustomization"
            listeners={{
              focus: () => {
                lockOrientationAsync(OrientationLock.DEFAULT);
              },
            }}
            component={GameCustomizationScreen}
            options={{ orientation: 'default', title: 'Adjust settings' }}
          />
          <Stack.Screen
            name="Game"
            listeners={{
              focus: () => {
                lockOrientationAsync(OrientationLock.LANDSCAPE_LEFT);
              },
            }}
            component={GameScreen}
            options={{ orientation: 'landscape_left' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </IntlProvider>
  );
}
