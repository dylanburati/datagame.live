import { StyleSheet, ViewStyle } from 'react-native';

export const styleConfig = {
  topMaxWidth: 1024,
  marginPx(lvl: number) {
    return lvl * 4;
  },
  margins(levels: number[]): Record<string, ViewStyle> {
    const parts: Record<string, ViewStyle>[] = levels.map((lvl) => ({
      [`m${lvl}`]: {
        margin: this.marginPx(lvl),
      },
      [`my${lvl}`]: {
        marginTop: this.marginPx(lvl),
        marginBottom: this.marginPx(lvl),
      },
      [`mx${lvl}`]: {
        marginLeft: this.marginPx(lvl),
        marginRight: this.marginPx(lvl),
      },
      [`mt${lvl}`]: {
        marginTop: this.marginPx(lvl),
      },
      [`mb${lvl}`]: {
        marginBottom: this.marginPx(lvl),
      },
      [`ml${lvl}`]: {
        marginLeft: this.marginPx(lvl),
      },
      [`mr${lvl}`]: {
        marginRight: this.marginPx(lvl),
      },
    }));
    return parts.reduce((acc, cur) => ({ ...acc, ...cur }));
  },
};

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
  itemsBaseline: {
    alignItems: 'baseline',
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
  flexCol: {
    flexDirection: 'column',
  },
  flexWrap: {
    flexWrap: 'wrap',
  },
  flexGrow: {
    flexGrow: 1,
  },
  flexInitial: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
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
    backgroundColor: '#E4E4E7',
  },
  bgGray300: {
    backgroundColor: '#D4D4D8',
  },
  bgGray350: {
    backgroundColor: '#BBBBC2',
  },
  bgBlue: {
    backgroundColor: '#1D4ED8',
  },
  bgBlue300: {
    backgroundColor: '#95B5FF',
  },
  bgBlue900: {
    backgroundColor: '#1E3A8A',
  },
  bgPurple300: {
    backgroundColor: '#C4B5FD',
  },
  bgSeaGreen300: {
    backgroundColor: '#75F0B5',
  },
  bgRed300: {
    backgroundColor: '#FCA5A5',
  },
  bgGreen: {
    backgroundColor: '#059669',
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
  left0: {
    left: 0,
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
  pt2: {
    paddingTop: 8,
  },
  pr4: {
    paddingRight: 16,
  },
  pb4: {
    paddingBottom: 16,
  },
  pb8: {
    paddingBottom: 32,
  },
  pb16: {
    paddingBottom: 64,
  },
  pl2: {
    paddingLeft: 8,
  },
  py2: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  px2: {
    paddingLeft: 8,
    paddingRight: 8,
  },
  p0: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
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
  mr2: {
    marginRight: 8,
  },
  mb1: {
    marginBottom: 4,
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
  ml2: {
    marginLeft: 8,
  },
  ml4: {
    marginLeft: 16,
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
  my4: {
    marginTop: 16,
    marginBottom: 16,
  },
  my8: {
    marginTop: 32,
    marginBottom: 32,
  },
  textCenter: {
    textAlign: 'center',
  },
  textXs: {
    fontSize: 11,
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
  textEmerald: {
    color: '#059669',
  },
  textPenFaint: {
    color: '#71717A',
  },
  italic: {
    fontStyle: 'italic',
  },
  fontBold: {
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
  roundedTopLeftXl: {
    borderTopLeftRadius: 20,
  },
  roundedTopRightXl: {
    borderTopRightRadius: 20,
  },
  border: {
    borderWidth: 1,
  },
  borderY: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  borderGray300: {
    borderColor: '#D1D5DB',
  },
  borderPurpleAccent: {
    borderColor: '#7707FF',
  },
  borderGreenAccent: {
    borderColor: '#00c175',
  },
  borderRedAccent: {
    borderColor: '#ff5555',
  },
  // non-tailwind
  topContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'stretch',
    justifyContent: 'center',
    maxWidth: '100%',
    width: styleConfig.topMaxWidth,
    marginLeft: 'auto',
    marginRight: 'auto',
    overflow: 'hidden',
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
  swipeablePanel: {
    maxWidth: styleConfig.topMaxWidth,
  },
  allowFab: {
    paddingBottom: 48,
  },
  space4: {
    height: 16,
    width: 16,
  },
  zMinusOne: {
    zIndex: -1,
  },
  zMinusTwo: {
    zIndex: -2,
  },
  leadingMd: {
    lineHeight: 16,
  },
  leadingLg: {
    lineHeight: 20,
  },
});
