import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  topContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckTile: {
    flexGrow: 0,
    height: 150,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  centerAll: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemsCenter: {
    alignItems: 'center',
  },
  itemsStretch: {
    alignItems: 'stretch',
  },
  itemsEnd: {
    alignItems: 'flex-end',
  },
  justifyStart: {
    justifyContent: 'flex-start',
  },
  justifyCenter: {
    justifyContent: 'center',
  },
  flexGrow: {
    flexGrow: 1,
  },
  flexBasisOneThird: {
    flex: 1, //: '33.33%',
  },
  absolute: {
    position: 'absolute',
  },
  bgPaperDarker: {
    backgroundColor: '#D1D5DB',
  },
  bgBlue: {
    backgroundColor: '#1D4ED8',
  },
  bgRed: {
    backgroundColor: '#f44',
  },
  inset0: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  bottom0: {
    bottom: 0,
  },
  right0: {
    right: 0,
  },
  p1: {
    padding: 4,
  },
  p2: {
    padding: 8,
  },
  p4: {
    padding: 16,
  },
  pr4: {
    paddingRight: 16,
  },
  pb4: {
    paddingBottom: 16,
  },
  m4: {
    margin: 16,
  },
  mt2: {
    marginTop: 8,
  },
  mt4: {
    marginTop: 16,
  },
  mt8: {
    marginTop: 32,
  },
  mb4: {
    marginBottom: 16,
  },
  mb8: {
    marginBottom: 32,
  },
  mx4: {
    marginLeft: 16,
    marginRight: 16,
  },
  space4: {
    height: 16,
    width: 16,
  },
  textCenter: {
    textAlign: 'center',
  },
  textSm: {
    fontSize: 14,
  },
  textMd: {
    fontSize: 16,
  },
  textLg: {
    fontSize: 20,
  },
  textXl: {
    fontSize: 28,
  },
  text2Xl: {
    fontSize: 36,
  },
  text3Xl: {
    fontSize: 48,
  },
  textWhite: {
    color: '#fff',
  },
  textRed: {
    color: '#DC2626',
  },
  fontWeightBold: {
    fontWeight: 'bold',
  },
  wFull: {
    width: '100%',
  },
  wHalf: {
    width: '50%',
  },
  hFull: {
    height: '100%',
  },
  roundedMd: {
    borderRadius: 4,
  },
  roundedLg: {
    borderRadius: 8,
  },
  roundedFull: {
    borderRadius: 9999,
  },
  iconBtn: {
    borderRadius: 9999,
    width: 24,
    height: 24,
    padding: 4,
  },
});
