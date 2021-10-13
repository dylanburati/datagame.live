import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  itemsCenter: {
    alignItems: 'center',
  },
  itemsStretch: {
    alignItems: 'stretch',
  },
  itemsEnd: {
    alignItems: 'flex-end',
  },
  itemsStart: {
    alignItems: 'flex-start',
  },
  justifyStart: {
    justifyContent: 'flex-start',
  },
  justifySpaceAround: {
    justifyContent: 'space-around',
  },
  justifyCenter: {
    justifyContent: 'center',
  },
  flexGrow: {
    flexGrow: 1,
  },
  flex1: {
    flex: 1,
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
  bgBlue900: {
    backgroundColor: '#1E3A8A',
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
  pl2: {
    paddingLeft: 8,
  },
  pr4: {
    paddingRight: 16,
  },
  pb4: {
    paddingBottom: 16,
  },
  pb16: {
    paddingBottom: 64,
  },
  py2: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  m2: {
    margin: 8,
  },
  m4: {
    margin: 16,
  },
  m6: {
    margin: 24,
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
  mb2: {
    marginBottom: 8,
  },
  mb4: {
    marginBottom: 16,
  },
  mb8: {
    marginBottom: 32,
  },
  mb16: {
    marginBottom: 64,
  },
  mx2: {
    marginLeft: 8,
    marginRight: 8,
  },
  mx4: {
    marginLeft: 16,
    marginRight: 16,
  },
  mx6: {
    marginLeft: 24,
    marginRight: 24,
  },
  my8: {
    marginTop: 32,
    marginBottom: 32,
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
  textBlue: {
    color: '#1D4ED8',
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
  // non-tailwind
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
    // height: 150,
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
  startAll: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  iconBtn: {
    borderRadius: 9999,
    width: 24,
    height: 24,
    padding: 4,
  },
  allowFab: {
    paddingBottom: 48,
  },
});
