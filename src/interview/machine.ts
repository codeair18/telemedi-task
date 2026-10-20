// Reducer wywiadu: fazy, scalanie pól, warunki końca. Czysty TS, bez React Native.
import type { Turn, TurnResult } from '../ai/prompt';
import { EXTRA_QUESTION, MAX_FOLLOWUPS, OPENING_QUESTION } from '../config';
import { detectRedFlagPhrases } from './redFlagPhrases';
import { emptySlots, missingRequired, SLOT_KEYS, type RedFlag, type Slots } from './slots';

export type Phase =
  | 'intro'
  | 'asking'
  | 'recording'
  | 'processing'
  | 'redflag'
  | 'review'
  | 'shared'
  | 'error';

export type ErrorKind = 'auth' | 'rate' | 'network' | 'bad_response';
export type ErrorStage = 'transcribe' | 'analyze';

// Stan sprzed tury, żeby „Nagraj ponownie” mogło ją cofnąć.
type Snapshot = Pick<InterviewState, 'slots' | 'followupsAsked' | 'question' | 'mode'>;

export type InterviewState = {
  phase: Phase;
  mode: 'interview' | 'extra';
  question: string;
  turns: Turn[];
  slots: Slots;
  flags: RedFlag[];
  newFlags: RedFlag[];
  afterRedflag: 'asking' | 'review';
  followupsAsked: number;
  extraUsed: boolean;
  heard: string | null;
  notice: string | null;
  error: { kind: ErrorKind; stage: ErrorStage } | null;
  history: Snapshot[];
};

export type Action =
  | { type: 'start' }
  | { type: 'record_start' }
  | { type: 'record_stop' }
  | { type: 'transcript_empty' }
  | { type: 'transcribed'; text: string }
  | { type: 'analyzed'; result: TurnResult }
  | { type: 'failed'; kind: ErrorKind; stage: ErrorStage }
  | { type: 'retry' }
  | { type: 'rerecord' }
  | { type: 'dismiss_flag' }
  | { type: 'add_more' }
  | { type: 'shared' }
  | { type: 'reset' };

export function initialState(): InterviewState {
  return {
    phase: 'intro',
    mode: 'interview',
    question: OPENING_QUESTION,
    turns: [],
    slots: emptySlots(),
    flags: [],
    newFlags: [],
    afterRedflag: 'asking',
    followupsAsked: 0,
    extraUsed: false,
    heard: null,
    notice: null,
    error: null,
    history: [],
  };
}

// Model nie może „zgubić” ustalonego pola, ale może je poprawić (intent.md 5.3).
export function mergeSlots(old: Slots, next: Slots): Slots {
  return Object.fromEntries(
    SLOT_KEYS.map((k) => [k, next[k].value !== null ? next[k] : old[k]]),
  ) as Slots;
}

export function isInterviewDone(args: {
  slots: Slots;
  followupsAsked: number;
  wantsToFinish: boolean;
  nextQuestion: string | null;
}): boolean {
  return (
    missingRequired(args.slots).length === 0 ||
    args.followupsAsked >= MAX_FOLLOWUPS ||
    args.wantsToFinish ||
    args.nextQuestion === null
  );
}

function applyTurn(state: InterviewState, result: TurnResult): InterviewState {
  const slots = mergeSlots(state.slots, result.slots);
  const lastAnswer = state.turns[state.turns.length - 1]?.answer ?? '';
  const fresh = [...new Set([...result.red_flags, ...detectRedFlagPhrases(lastAnswer)])].filter(
    (f) => !state.flags.includes(f),
  );
  const done =
    state.mode === 'extra' ||
    isInterviewDone({
      slots,
      followupsAsked: state.followupsAsked,
      wantsToFinish: result.patient_wants_to_finish,
      nextQuestion: result.next_question,
    });
  const target = done ? 'review' : 'asking';
  return {
    ...state,
    slots,
    flags: [...state.flags, ...fresh],
    newFlags: fresh,
    afterRedflag: target,
    phase: fresh.length > 0 ? 'redflag' : target,
    question: done ? state.question : result.next_question!,
    followupsAsked: done ? state.followupsAsked : state.followupsAsked + 1,
  };
}

export function reducer(state: InterviewState, action: Action): InterviewState {
  switch (action.type) {
    case 'start':
      return { ...state, phase: 'asking' };
    case 'record_start':
      return { ...state, phase: 'recording', notice: null, error: null };
    case 'record_stop':
      return { ...state, phase: 'processing' };
    case 'transcript_empty':
      // Cisza nie zużywa tury.
      return { ...state, phase: 'asking', notice: 'Nie usłyszałem odpowiedzi, spróbujmy jeszcze raz.' };
    case 'transcribed':
      return {
        ...state,
        history: [
          ...state.history,
          { slots: state.slots, followupsAsked: state.followupsAsked, question: state.question, mode: state.mode },
        ],
        turns: [...state.turns, { question: state.question, answer: action.text }],
        heard: action.text,
      };
    case 'analyzed':
      return applyTurn(state, action.result);
    case 'failed':
      // Zła odpowiedź modelu po ponowieniu: podsumowanie z tym, co już jest. Wywiad nigdy nie przepada.
      if (action.stage === 'analyze' && action.kind === 'bad_response') {
        return {
          ...state,
          phase: 'review',
          notice: 'Nie udało się przeanalizować ostatniej odpowiedzi. Lekarz zobaczy ją w pełnej transkrypcji.',
        };
      }
      return { ...state, phase: 'error', error: { kind: action.kind, stage: action.stage } };
    case 'retry':
      return { ...state, phase: 'processing', error: null };
    case 'rerecord': {
      const snap = state.history[state.history.length - 1];
      if (!snap) return state;
      // Flagi alarmowe zostają: raz zgłoszony sygnał nie znika.
      return {
        ...state,
        ...snap,
        turns: state.turns.slice(0, -1),
        history: state.history.slice(0, -1),
        heard: null,
        notice: null,
        phase: 'asking',
      };
    }
    case 'dismiss_flag':
      return { ...state, phase: state.afterRedflag, newFlags: [] };
    case 'add_more':
      if (state.extraUsed) return state;
      return {
        ...state,
        mode: 'extra',
        extraUsed: true,
        question: EXTRA_QUESTION,
        heard: null,
        notice: null,
        phase: 'asking',
      };
    case 'shared':
      return { ...state, phase: 'shared' };
    case 'reset':
      return initialState();
  }
}
