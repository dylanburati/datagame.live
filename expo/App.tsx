import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  lockAsync as lockOrientationAsync,
  OrientationLock,
} from 'expo-screen-orientation';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GameScreen } from './components/GameScreen';
import { Loader } from './components/Loader';
import { GameCustomizationScreen } from './components/GameCustomizationScreen';
import { RootStackParamList, useNavigationTyped } from './helpers/navigation';
import { listDecks } from './helpers/api';
import { styles } from './styles';

function randomColor(x: number, l2: number) {
  let h = (511 * (x + 31) * (x + 31) + 3 * (x - 31)) % 360;
  if (h > 60 && h < 105) {
    h += 120;
  }
  const s = ((767 * (h + 32) * h) % 400) / 8 + l2 / 2;
  const l = l2 - 15 + Math.min(20, Math.abs(h - 120) / 3);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

type Topic = {
  id: number;
  title: string;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function HomeScreen() {
  const [topicList, setTopicList] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const { navigate } = useNavigationTyped();

  useEffect(() => {
    const get = async () => {
      setLoading(true);
      try {
        setTopicList(await listDecks());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    get();
  }, []);

  return (
    <View style={styles.topContainer}>
      <FlatList
        numColumns={3}
        ListHeaderComponent={
          <View style={[styles.row, styles.justifyCenter]}>
            <Text style={[styles.mb4, styles.textLg, styles.fontWeightBold]}>
              Decks
            </Text>
          </View>
        }
        data={topicList}
        contentContainerStyle={styles.m4}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={loading ? Loader : null}
        renderItem={({ item, index }) => (
          <View style={[styles.p2, styles.flexBasisOneThird]}>
            <TouchableOpacity
              onPress={() => navigate('GameCustomization', { topic: item.id })}
              style={[
                styles.centerAll,
                styles.deckTile,
                styles.roundedMd,
                styles.p2,
                { backgroundColor: randomColor(2 * index, 30) },
              ]}
            >
              <Text
                numberOfLines={5}
                style={[styles.textCenter, styles.textLg, styles.textWhite]}
              >
                {item.title.toLocaleUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
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
  );
}
