import { range } from 'lodash';
import { RoomIncomingMessage } from '../helpers/api';

export const hangmanEvents: RoomIncomingMessage[] = [
  {
    event: 'join',
    displayName: 'luv',
    creatorId: 16,
    userId: 16,
    createdAt: '2017-09-09T21:00:00Z',
    users: [
      { userId: 16, displayName: 'luv', isPresent: true },
      { userId: 29, displayName: 'carti', isPresent: true },
      { userId: 31, displayName: 'cart1', isPresent: true },
      // { userId: 32, displayName: 'cart2', isPresent: false },
      // { userId: 33, displayName: 'cart3', isPresent: false },
      // { userId: 34, displayName: 'cart4', isPresent: false },
      { userId: 35, displayName: 'cart5', isPresent: true },
      { userId: 36, displayName: 'cart6', isPresent: true },
    ],
    roundMessages: [],
  },
  {
    event: 'turn:start',
    turnId: 1,
    trivia: {
      answerType: 'hangman',
      maxAnswers: 26,
      minAnswers: 1,
      questionValueType: 'number[]',
      options: range('A'.charCodeAt(0), 'Z'.charCodeAt(0) + 1).map((ch) => ({
        answer: String.fromCodePoint(ch),
        id: ch - 65,
        questionValue: [
          ...'RIO GRANDE'.matchAll(new RegExp(String.fromCharCode(ch), 'g')),
        ].map((e) => e.index ?? -1),
      })),
      prefilledAnswers: [
        {
          answer: ' ',
          id: 26,
          questionValue: [3],
        },
      ],
      question: 'River on a North American border',
    },
    durationMillis: 3_600_000,
    deadline: 2 ** 50,
  },
];
