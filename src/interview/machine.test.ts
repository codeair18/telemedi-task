import { describe, expect, it } from 'vitest';
import type { TurnResult } from '../ai/prompt';
import { MAX_FOLLOWUPS } from '../config';
import { formatNote } from '../summary/formatNote';
import { initialState, isInterviewDone, mergeSlots, reducer, type InterviewState } from './machine';
import { detectRedFlagPhrases } from './redFlagPhrases';
import { emptySlots, type Slots } from './slots';

function slotsWith(values: Partial<Record<keyof Slots, string>>): Slots {
  const s = emptySlots();
  for (const [k, v] of Object.entries(values)) s[k as keyof Slots] = { value: v, quote: v };
  return s;
}

function result(partial: Partial<TurnResult>): TurnResult {
  return { slots: emptySlots(), red_flags: [], next_question: null, patient_wants_to_finish: false, ...partial };
}

function answered(state: InterviewState, text: string, r: TurnResult): InterviewState {
  return reducer(reducer(state, { type: 'transcribed', text }), { type: 'analyzed', result: r });
}

describe('mergeSlots', () => {
  it('nie gubi ustalonego pola, gdy model zwróci null', () => {
    const merged = mergeSlots(slotsWith({ onset: '3 dni' }), emptySlots());
    expect(merged.onset.value).toBe('3 dni');
  });
  it('pozwala poprawić pole', () => {
    const merged = mergeSlots(slotsWith({ onset: '3 dni' }), slotsWith({ onset: '4 dni' }));
    expect(merged.onset.value).toBe('4 dni');
  });
});

describe('isInterviewDone', () => {
  const full = slotsWith({
    chief_complaint: 'x',
    onset: 'x',
    medications: 'x',
    allergies: 'x',
    patient_goal: 'x',
  });
  const base = { slots: emptySlots(), followupsAsked: 0, wantsToFinish: false, nextQuestion: 'q' };
  it('kończy, gdy są wszystkie wymagane', () => expect(isInterviewDone({ ...base, slots: full })).toBe(true));
  it('kończy po limicie pytań', () =>
    expect(isInterviewDone({ ...base, followupsAsked: MAX_FOLLOWUPS })).toBe(true));
  it('kończy, gdy pacjent chce skończyć', () => expect(isInterviewDone({ ...base, wantsToFinish: true })).toBe(true));
  it('kończy, gdy model nie ma pytania', () => expect(isInterviewDone({ ...base, nextQuestion: null })).toBe(true));
  it('trwa w pozostałych przypadkach', () => expect(isInterviewDone(base)).toBe(false));
});

describe('reducer', () => {
  const started = () => reducer(initialState(), { type: 'start' });

  it('zadaje pytanie uzupełniające i liczy je', () => {
    const s = answered(started(), 'boli gardło', result({ next_question: 'Czy jest uczulenie na leki?' }));
    expect(s.phase).toBe('asking');
    expect(s.question).toBe('Czy jest uczulenie na leki?');
    expect(s.followupsAsked).toBe(1);
  });

  it('kończy po 4 pytaniach uzupełniających', () => {
    let s = started();
    for (let i = 0; i < MAX_FOLLOWUPS; i++) s = answered(s, `odp ${i}`, result({ next_question: `p${i}` }));
    expect(s.phase).toBe('asking');
    s = answered(s, 'ostatnia', result({ next_question: 'jeszcze?' }));
    expect(s.phase).toBe('review');
    expect(s.turns).toHaveLength(MAX_FOLLOWUPS + 1);
  });

  it('pokazuje ekran 112 raz na typ flagi', () => {
    let s = answered(started(), 'boli', result({ red_flags: ['chest_pain'], next_question: 'q' }));
    expect(s.phase).toBe('redflag');
    s = reducer(s, { type: 'dismiss_flag' });
    expect(s.phase).toBe('asking');
    s = answered(s, 'dalej boli', result({ red_flags: ['chest_pain'], next_question: 'q2' }));
    expect(s.phase).toBe('asking');
    expect(s.flags).toEqual(['chest_pain']);
  });

  it('flaga w ostatniej turze prowadzi po 112 do podsumowania', () => {
    const s = answered(started(), 'boli', result({ red_flags: ['chest_pain'], next_question: null }));
    expect(s.phase).toBe('redflag');
    expect(reducer(s, { type: 'dismiss_flag' }).phase).toBe('review');
  });

  it('cisza nie zużywa tury', () => {
    const s = reducer(reducer(started(), { type: 'record_stop' }), { type: 'transcript_empty' });
    expect(s.phase).toBe('asking');
    expect(s.turns).toHaveLength(0);
    expect(s.notice).toBeTruthy();
  });

  it('„Nagraj ponownie” cofa turę i pola, ale nie flagi', () => {
    const before = started();
    const s = answered(
      before,
      'boli w klatce',
      result({ slots: slotsWith({ onset: 'wczoraj' }), red_flags: ['chest_pain'], next_question: 'q' }),
    );
    const r = reducer(reducer(s, { type: 'dismiss_flag' }), { type: 'rerecord' });
    expect(r.turns).toHaveLength(0);
    expect(r.slots.onset.value).toBeNull();
    expect(r.question).toBe(before.question);
    expect(r.followupsAsked).toBe(0);
    expect(r.flags).toEqual(['chest_pain']);
  });

  it('zła odpowiedź modelu prowadzi do podsumowania, błąd sieci do „Ponów”', () => {
    const s = reducer(started(), { type: 'transcribed', text: 'x' });
    expect(reducer(s, { type: 'failed', kind: 'bad_response', stage: 'analyze' }).phase).toBe('review');
    const e = reducer(s, { type: 'failed', kind: 'network', stage: 'analyze' });
    expect(e.phase).toBe('error');
    expect(e.turns).toHaveLength(1);
  });

  it('„Chcę coś dodać” to jedna dodatkowa tura', () => {
    let s = answered(started(), 'x', result({ next_question: null }));
    s = reducer(s, { type: 'add_more' });
    expect(s.phase).toBe('asking');
    s = answered(s, 'jeszcze to', result({ next_question: 'nie powinno paść' }));
    expect(s.phase).toBe('review');
    expect(reducer(s, { type: 'add_more' }).phase).toBe('review');
  });
});

describe('detectRedFlagPhrases', () => {
  it('scenariusz B', () => {
    const f = detectRedFlagPhrases(
      'Od godziny mam silny ból w klatce piersiowej, promieniuje do lewej ręki i ciężko mi oddychać.',
    );
    expect(f).toContain('chest_pain');
    expect(f).toContain('breathing_difficulty');
  });
  it('scenariusz A bez flag', () => {
    expect(
      detectRedFlagPhrases(
        'Od trzech dni boli mnie gardło, wczoraj miałem trzydzieści osiem i pół gorączki, biorę ibuprofen.',
      ),
    ).toEqual([]);
  });
});

describe('formatNote', () => {
  it('rozróżnia zaprzeczenie od luki i dołącza transkrypcję', () => {
    const note = formatNote({
      slots: slotsWith({ chief_complaint: 'ból gardła', allergies: 'brak (pacjent zaprzecza)' }),
      flags: [],
      turns: [{ question: 'Pytanie?', answer: 'Odpowiedź.' }],
      date: new Date(2026, 9, 20, 20, 31),
    });
    expect(note).toContain('Data: 2026-10-20 20:31');
    expect(note).toContain('⚠ SYGNAŁY ALARMOWE: brak');
    expect(note).toContain('Alergie, zwłaszcza na leki: brak (pacjent zaprzecza)');
    expect(note).toMatch(/Nie ustalono: od kiedy, nasilenie/);
    expect(note).not.toMatch(/Nie ustalono:.*alergie/);
    expect(note).toContain('Asystent: Pytanie?\nPacjent: Odpowiedź.');
  });
  it('flagi na górze notatki', () => {
    const note = formatNote({ slots: emptySlots(), flags: ['chest_pain'], turns: [], date: new Date() });
    expect(note.split('\n')[4]).toBe('⚠ SYGNAŁY ALARMOWE: ból w klatce piersiowej');
  });
});
