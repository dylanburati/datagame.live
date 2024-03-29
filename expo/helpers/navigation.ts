import {
  useNavigation,
  useRoute,
  NavigationProp,
  RouteProp,
} from '@react-navigation/native';
import { Game, RoomUser } from './api';

export type RootStackParamList = {
  Home: undefined;
  Game: Game & { title: string; gameLength: number };
  GameCustomization: { topic: number };
  Room: { roomId: string; savedSession?: RoomUser };
  LogViewer: undefined;
};

export function useNavigationTyped() {
  return useNavigation<NavigationProp<RootStackParamList>>();
}

export function useRouteTyped<T extends keyof RootStackParamList>() {
  return useRoute<RouteProp<RootStackParamList, T>>();
}
