import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  lockAsync as lockOrientationAsync,
  OrientationLock,
} from 'expo-screen-orientation';
import { locales } from 'expo-localization';
import {
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IntlProvider } from 'react-intl';
import { Audio } from 'expo-av';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { GameScreen } from './components/GameScreen';
import { Loader } from './components/Loader';
import { GameCustomizationScreen } from './components/GameCustomizationScreen';
import { RootStackParamList, useNavigationTyped } from './helpers/navigation';
import { createRoom, Deck, listDecks, RoomUser } from './helpers/api';
import { SocketProvider } from './components/SocketProvider';
import {
  defaultInfoContainerStyle,
  ExpandingInfoHeader,
} from './components/ExpandingInfoHeader';
import { GridLayout } from './components/GridLayout';
import { useSet } from './helpers/hooks';
import { styleConfig, styles } from './styles';
import config from './config';
import { RoomScreen } from './components/RoomScreen';
import { loadJson, LogPersist, roomStorageKey } from './helpers/storage';
import { LogViewer } from './components/LogViewer';

function randomColor(x: number, l2: number) {
  let h = (511 * (x + 31) * (x + 31) + 3 * (x - 31)) % 360;
  if (h > 60 && h < 105) {
    h += 120;
  }
  const s = ((767 * (h + 32) * h) % 400) / 8 + l2 / 2;
  const l = l2 - 15 + Math.min(20, Math.abs(h - 120) / 3);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

const AvoidKeyboardView = ({ children }: React.PropsWithChildren<{}>) => {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.flexGrow}>
        {children}
      </KeyboardAvoidingView>
    );
  }

  return <>{children}</>;
};

export function HomeScreen() {
  const [deckList, setDeckList] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(false);
  const { navigate } = useNavigationTyped();
  const retryRef = useRef<number>();
  const [retryCounter, setRetryCounter] = useState(1);
  const { set: loadedImages, add: markImageLoaded } = useSet(new Set<number>());
  const displayDecks = useMemo(
    () =>
      deckList.map((deck) => ({
        deck,
        hasImageLoaded: loadedImages.has(deck.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedImages.size, deckList]
  );
  const [draftRoomNickname, setDraftRoomNickname] = useState({
    text: '',
    error: undefined as string | undefined,
  });
  const [draftRoomId, setDraftRoomId] = useState('');
  const scrollView = useRef<ScrollView>(null);

  useEffect(() => {
    const get = async () => {
      setLoading(true);
      try {
        setDeckList(await listDecks());
        setRetryCounter(0);
      } catch (err) {
        LogPersist.error(err);
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

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollView.current?.scrollToEnd();
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const [informationOpen, setInformationOpen] = useState(0);
  const [hostOrJoin, setHostOrJoin] = useState(1);
  const hostRequestRunning = useRef(false);
  const hostRoom = async () => {
    if (hostRequestRunning.current || !draftRoomNickname.text) {
      return;
    }
    hostRequestRunning.current = true;
    try {
      const { roomId, ...details } = await createRoom(draftRoomNickname.text);
      navigate('Room', { roomId, savedSession: details ?? undefined });
    } catch (err) {
      setDraftRoomNickname((val) => ({
        ...val,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    } finally {
      hostRequestRunning.current = false;
    }
  };
  const goToRoom = async (roomId: string) => {
    if (!roomId) {
      return;
    }
    const details = await loadJson<RoomUser>(roomStorageKey(roomId));
    navigate('Room', { roomId, savedSession: details ?? undefined });
  };

  return (
    <View style={styles.topContainer}>
      <AvoidKeyboardView>
        <ScrollView
          ref={scrollView}
          style={styles.flex1}
          keyboardShouldPersistTaps="handled"
        >
          <ExpandingInfoHeader
            style={[styles.row, styles.mx6, styles.mt8, styles.mb4]}
            infoContainerStyle={[defaultInfoContainerStyle, styles.mx6]}
            title="Taboo"
            infoVisible={informationOpen === 1}
            onPress={() => setInformationOpen(informationOpen === 1 ? 0 : 1)}
          >
            Timed game mode where your friends help you guess the card showing
            on the screen, without saying any of the words.
          </ExpandingInfoHeader>
          {loading && deckList.length === 0 && <Loader />}
          {deckList.length > 0 && (
            <GridLayout
              style={styles.mx4}
              data={displayDecks}
              minColumnWidth={120}
              maxColumnCount={8}
              gridMaxWidth={styleConfig.topMaxWidth}
              horizontalInset={2 * styleConfig.marginPx(4)}
            >
              {({ item: { deck, hasImageLoaded }, index, width }) => {
                const padding = 2 * styleConfig.marginPx(2);
                const imgWidth = width - padding;
                const height = (imgWidth * 5) / 3;
                return (
                  <View key={index} style={[styles.p2, { height, width }]}>
                    <TouchableOpacity
                      onPress={() =>
                        navigate('GameCustomization', { topic: deck.id })
                      }
                      style={[styles.deckTile, styles.hFull]}
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
                              deck.imageDominantColor ||
                              randomColor(2 * index, 30),
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
                );
              }}
            </GridLayout>
          )}
          <ExpandingInfoHeader
            style={[styles.row, styles.mx6, styles.mt8, styles.mb4]}
            infoContainerStyle={[defaultInfoContainerStyle, styles.mx6]}
            title="Party"
            infoVisible={informationOpen === 2}
            onPress={() => setInformationOpen(informationOpen === 2 ? 0 : 2)}
          >
            Multiple people join the game from their own devices, and on each
            turn the group tries to earn points by completing challenges.
          </ExpandingInfoHeader>
          <SegmentedControl
            style={styles.mx6}
            values={['Host', 'Join']}
            selectedIndex={hostOrJoin}
            onChange={(evt) =>
              setHostOrJoin(evt.nativeEvent.selectedSegmentIndex)
            }
          />
          {hostOrJoin === 0 && (
            <View style={[styles.mt2, styles.mx6, styles.p2]}>
              <TextInput
                style={[
                  styles.mt4,
                  styles.p2,
                  styles.bgPaperDarker,
                  styles.textMd,
                  styles.roundedLg,
                ]}
                autoCapitalize="none"
                textContentType="nickname"
                placeholder="Enter a username"
                value={draftRoomNickname.text}
                onChangeText={(text) =>
                  setDraftRoomNickname({ text, error: undefined })
                }
                returnKeyType="go"
                onSubmitEditing={hostRoom}
              />
              {draftRoomNickname.error && (
                <Text style={[styles.textRed]}>{draftRoomNickname.error}</Text>
              )}
              <TouchableOpacity
                style={[
                  styles.bgBlue900,
                  styles.roundedLg,
                  styles.mt2,
                  styles.p4,
                ]}
                onPress={hostRoom}
              >
                <Text style={[styles.textWhite, styles.textCenter]}>HOST</Text>
              </TouchableOpacity>
            </View>
          )}
          {hostOrJoin === 1 && (
            <View style={[styles.mt2, styles.mx6, styles.p2]}>
              <TextInput
                style={[
                  styles.mt4,
                  styles.mb2,
                  styles.p2,
                  styles.bgPaperDarker,
                  styles.textMd,
                  styles.roundedLg,
                ]}
                autoCapitalize="characters"
                placeholder="Enter code"
                value={draftRoomId}
                onChangeText={(text) => setDraftRoomId(text.replace(/\s/g, ''))}
                returnKeyType="go"
                onSubmitEditing={() => goToRoom(draftRoomId.toUpperCase())}
              />
              <TouchableOpacity
                style={[styles.bgBlue, styles.roundedLg, styles.p4]}
                onPress={() => goToRoom(draftRoomId.toUpperCase())}
              >
                <Text style={[styles.textWhite, styles.textCenter]}>JOIN</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.centerAll, styles.mt8]}>
            <TouchableOpacity
              style={[styles.bgBlack, styles.roundedLg, styles.px4, styles.py2]}
              onPress={() => navigate('LogViewer')}
            >
              <Text style={[styles.textWhite, styles.textCenter]}>
                VIEW LOGS
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.mx6, styles.my8]}>
            <Text style={styles.textSm}>Copyright (c) 2021 Dylan Burati</Text>
          </View>
        </ScrollView>
      </AvoidKeyboardView>
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
  const isMobile = Platform.OS === 'android' || Platform.OS === 'ios';
  // TODO: switch to jsc-intl variant so that react-intl works on all locales
  const locale = Platform.OS === 'android' ? 'en-US' : locales[0];

  return (
    <IntlProvider locale={locale}>
      <SocketProvider wsUrl={`${config.baseUrl.replace(/^http/, 'ws')}/socket`}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Home">
            <Stack.Screen
              name="Home"
              listeners={{
                focus: () => {
                  if (isMobile) {
                    lockOrientationAsync(OrientationLock.DEFAULT);
                  }
                },
              }}
              component={HomeScreen}
              options={{ orientation: 'default' }}
            />
            <Stack.Screen
              name="GameCustomization"
              listeners={{
                focus: () => {
                  if (isMobile) {
                    lockOrientationAsync(OrientationLock.DEFAULT);
                  }
                },
              }}
              component={GameCustomizationScreen}
              options={{ orientation: 'default', title: 'Adjust settings' }}
            />
            <Stack.Screen
              name="Game"
              listeners={{
                focus: () => {
                  if (isMobile) {
                    lockOrientationAsync(OrientationLock.LANDSCAPE_LEFT);
                  }
                },
              }}
              component={GameScreen}
              options={{ orientation: 'landscape_left' }}
            />
            <Stack.Screen
              name="Room"
              component={RoomScreen}
              options={{ orientation: 'default', title: 'Room' }}
            />
            <Stack.Screen
              name="LogViewer"
              component={LogViewer}
              options={{ orientation: 'default', title: 'Logs' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SocketProvider>
    </IntlProvider>
  );
}
