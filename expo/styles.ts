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
  selfStart: {
    alignSelf: 'flex-start',
  },
  selfCenter: {
    alignSelf: 'center',
  },
  flexRow: {
    flexDirection: 'row',
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
  flexShrink: {
    flexShrink: 1,
  },
  flexShrink2: {
    flexShrink: 2,
  },
  flexInitial: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
  },
  flex0: {
    flex: 0,
  },
  flex1: {
    flex: 1,
  },
  flexBasis16: {
    flexBasis: 16,
  },
  flexBasis54: {
    flexBasis: 54,
  },
  relative: {
    position: 'relative',
  },
  absolute: {
    position: 'absolute',
  },
  bgPaper: {
    backgroundColor: '#FFF',
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
  bgBlack: {
    backgroundColor: '#000',
  },
  bgBlue: {
    backgroundColor: '#1D4ED8',
  },
  bgBlue100: {
    backgroundColor: '#DBEAFE',
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
  bgGreen: {
    backgroundColor: '#059669',
  },
  bgRed300: {
    backgroundColor: '#FCA5A5',
  },
  bgRed: {
    backgroundColor: '#f44',
  },
  bgAmber200: {
    backgroundColor: '#FDE68A',
  },
  inset0: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  inset0_5: {
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
  },
  top0: {
    top: 0,
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
  bottom50Percent: {
    bottom: '50%',
  },
  p0_5: {
    padding: 2,
  },
  p1: {
    padding: 4,
  },
  p1_5: {
    padding: 6,
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
  pb1_5: {
    paddingBottom: 6,
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
  px4: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  p0: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  m0_5: {
    margin: 2,
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
  mr1: {
    marginRight: 4,
  },
  mr2: {
    marginRight: 8,
  },
  mr3: {
    marginRight: 12,
  },
  mr4: {
    marginRight: 16,
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
  ml1: {
    marginLeft: 4,
  },
  ml2: {
    marginLeft: 8,
  },
  ml4: {
    marginLeft: 16,
  },
  mx0_5: {
    marginLeft: 2,
    marginRight: 2,
  },
  mx1: {
    marginLeft: 4,
    marginRight: 4,
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
  my2_5: {
    marginTop: 10,
    marginBottom: 10,
  },
  my4: {
    marginTop: 16,
    marginBottom: 16,
  },
  my8: {
    marginTop: 32,
    marginBottom: 32,
  },
  opacity50: {
    opacity: 0.5,
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
  textTrackingExtraWide: {
    letterSpacing: 7,
  },
  textWhite: {
    color: '#fff',
  },
  textBlueAccent: {
    color: '#006ED8',
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
  textGreenAccent: {
    color: '#00c175',
  },
  textPenFaint: {
    color: '#717176',
  },
  textPenFainter: {
    color: '#8E8E93',
  },
  italic: {
    fontStyle: 'italic',
  },
  fontBold: {
    fontWeight: 'bold',
  },
  fontMonospace: {
    fontFamily: 'RobotoMono-Light',
  },
  wFull: {
    width: '100%',
  },
  wHalf: {
    width: '50%',
  },
  wEleventh: {
    width: '9.09%',
  },
  wFiveSixths: {
    width: '90.9%',
  },
  w16Px: {
    width: 16,
  },
  w40Px: {
    width: 40,
  },
  h1: {
    height: 4,
  },
  hFull: {
    height: '100%',
  },
  minH200Px: {
    minHeight: 200,
  },
  roundedMd: {
    borderRadius: 4,
  },
  roundedTopLeftLg: {
    borderTopLeftRadius: 8,
  },
  roundedBottomLeftLg: {
    borderBottomLeftRadius: 8,
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
  borderBottom: {
    borderBottomWidth: 1,
  },
  borderRight: {
    borderRightWidth: 1,
  },
  borderBottom8: {
    borderBottomWidth: 8,
  },
  borderDotted: {
    borderStyle: 'solid',
    borderRadius: 1,
  },
  borderGray300: {
    borderColor: '#D1D5DB',
  },
  borderGray400: {
    borderColor: '#9CA3AF',
  },
  borderBlueAccent: {
    borderColor: '#007AFF',
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
  space10Px: {
    height: 10,
  },
  space4: {
    height: 16,
    width: 16,
  },
  square15Px: {
    height: 15,
    width: 15,
  },
  square20Px: {
    height: 20,
    width: 20,
  },
  square44Px: {
    height: 44,
    width: 44,
  },
  maxW40Px: {
    maxWidth: 40,
  },
  maxH54Px: {
    maxHeight: 54,
  },
  aspect1: {
    aspectRatio: 1,
  },
  z999: {
    zIndex: 999,
  },
  elevation1: {
    elevation: 1,
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
  leadingXl: {
    lineHeight: 40,
  },
  raiseMinusOne: {
    transform: [{ translateY: 1 }],
  },
  shiftOne: {
    transform: [{ translateX: 4 }],
  },
});
