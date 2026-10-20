/// <reference types="node" />
// Test promptu bez telefonu: GROQ_API_KEY=... npx tsx scripts/try-turn.ts
// Przepuszcza teksty ze scenariuszy A i B (intent.md 11) przez reducer i prawdziwy model.
import { nextTurn } from '../src/ai/groq';
import { buildTurnInput } from '../src/ai/prompt';
import { DEFAULT_LLM_MODEL } from '../src/config';
import { initialState, reducer, type InterviewState } from '../src/interview/machine';
import { missingRequired } from '../src/interview/slots';
import { formatNote } from '../src/summary/formatNote';

const key = process.env.GROQ_API_KEY;
const model = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
if (!key) {
  console.error('Ustaw GROQ_API_KEY.');
  process.exit(1);
}

async function answer(state: InterviewState, text: string): Promise<InterviewState> {
  let s = reducer(state, { type: 'transcribed', text });
  const input = buildTurnInput({
    turns: s.turns,
    slots: s.slots,
    followupsAsked: s.followupsAsked,
    flags: s.flags,
    allowQuestion: s.mode === 'interview',
  });
  const t0 = Date.now();
  const result = await nextTurn(input, key!, model);
  console.log(`\n[${Date.now() - t0} ms] Pacjent: ${text}`);
  console.log(JSON.stringify(result, null, 2));
  s = reducer(s, { type: 'analyzed', result });
  console.log(`→ faza: ${s.phase}, pytanie: ${s.phase === 'review' ? '—' : s.question}, flagi: [${s.flags}]`);
  if (s.phase === 'redflag') s = reducer(s, { type: 'dismiss_flag' });
  return s;
}

function check(label: string, ok: boolean) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  console.log('=== Scenariusz A ===');
  let a = reducer(initialState(), { type: 'start' });
  a = await answer(
    a,
    'Od trzech dni boli mnie gardło, wczoraj miałem trzydzieści osiem i pół gorączki, biorę ibuprofen. Potrzebuję zwolnienia do pracy.',
  );
  check('po pierwszej turze brakuje alergii', missingRequired(a.slots).includes('allergies'));
  check('pytanie dotyczy alergii/uczulenia', /alerg|uczul/i.test(a.question));
  a = await answer(a, 'Nie mam alergii. Leczę się na nadciśnienie, biorę ramipril.');
  check('wywiad zakończony', a.phase === 'review');
  check('alergie = zaprzeczenie', /brak/i.test(a.slots.allergies.value ?? ''));
  console.log('\n' + formatNote({ slots: a.slots, flags: a.flags, turns: a.turns, date: new Date() }));

  console.log('\n=== Scenariusz B ===');
  let b = reducer(initialState(), { type: 'start' });
  b = await answer(
    b,
    'Od godziny mam silny ból w klatce piersiowej, promieniuje do lewej ręki i ciężko mi oddychać.',
  );
  check('flaga chest_pain', b.flags.includes('chest_pain'));
  check('flaga breathing_difficulty', b.flags.includes('breathing_difficulty'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
