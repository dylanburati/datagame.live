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
      { userId: 16, displayName: 'luv' },
      { userId: 29, displayName: 'carti' },
    ],
    roundMessages: [],
  },
  {
    event: 'round:start',
    playerOrder: [16, 29],
  },
  {
    event: 'turn:start',
    turnId: 1,
    userId: 16,
    trivia: {
      answerType: 'hangman',
      maxAnswers: 26,
      minAnswers: 1,
      options: range('A'.charCodeAt(0), 'Z'.charCodeAt(0) + 1).map((ch) => ({
        answer: String.fromCodePoint(ch),
        id: ch,
        questionValueType: 'number[]',
        questionValue: [
          ...'RIO GRANDE'.matchAll(new RegExp(String.fromCharCode(ch), 'g')),
        ].map((e) => e.index ?? -1),
      })),
      question: 'River on a North American border',
    },
  },
];
