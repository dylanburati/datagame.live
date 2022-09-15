import AsyncStorage from '@react-native-async-storage/async-storage';

export const storeJson = async (key: string, value: unknown) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('not saved');
  }
};

export const loadJson = async <T>(
  key: string,
  dfault: T | null = null
): Promise<T | null> => {
  try {
    const str = await AsyncStorage.getItem(key);
    return str === null ? dfault : JSON.parse(str);
  } catch (e) {
    return dfault;
  }
};

export function roomStorageKey(roomId: string) {
  return `room:v0:${roomId}`;
}
