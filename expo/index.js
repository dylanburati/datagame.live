import { registerRootComponent } from 'expo';
import App from './App';

const isAndroid = require('react-native').Platform.OS === 'android';
const isHermesEnabled = !!global.HermesInternal;

if (isHermesEnabled || isAndroid) {
  require('@formatjs/intl-getcanonicallocales/polyfill');
  require('@formatjs/intl-locale/polyfill');

  require('@formatjs/intl-pluralrules/polyfill');
  require('@formatjs/intl-pluralrules/locale-data/en.js');

  // require('@formatjs/intl-displaynames/polyfill');
  // require('@formatjs/intl-displaynames/locale-data/en.js');

  // require('@formatjs/intl-listformat/polyfill');
  // require('@formatjs/intl-listformat/locale-data/en.js');

  require('@formatjs/intl-numberformat/polyfill');
  require('@formatjs/intl-numberformat/locale-data/en.js');

  require('@formatjs/intl-relativetimeformat/polyfill');
  require('@formatjs/intl-relativetimeformat/locale-data/en.js');

  require('@formatjs/intl-datetimeformat/polyfill');
  require('@formatjs/intl-datetimeformat/locale-data/en.js');

  require('@formatjs/intl-datetimeformat/add-golden-tz.js');

  // https://formatjs.io/docs/polyfills/intl-datetimeformat/#default-timezone
  if ('__setDefaultTimeZone' in Intl.DateTimeFormat) {
    try {
      const tz = require('expo-localization').getCalendars()[0].timeZone;
      if (tz != null) {
        Intl.DateTimeFormat.__setDefaultTimeZone(tz);
      }
    } catch (err) {
      console.warn('No default timezone');
    }
  }
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
