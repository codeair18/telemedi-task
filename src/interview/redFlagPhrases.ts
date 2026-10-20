import type { RedFlag } from './slots';

// Drugie zabezpieczenie obok LLM (intent.md 14): deterministyczne frazy w transkrypcji.
// Celowo szerokie, bo przegapiony sygnał jest gorszy niż fałszywy alarm z przyciskiem „To nie to”.
// Nie rozpoznaje zaprzeczeń („nie boli mnie w klatce” też zaznaczy).
const PATTERNS: [RedFlag, RegExp][] = [
  ['chest_pain', /klat(ce|ka|ki|kę|k\w*) piersiow|w klatce|za mostkiem/],
  ['breathing_difficulty', /duszn|duszę się|nie mogę oddychać|ciężko\s+(mi\s+)?oddychać|trudno\s+(mi\s+)?oddychać|brak\w* (mi )?(tchu|powietrza)/],
  ['stroke_signs', /opad\w* kąci|bełko|niedowład|zdrętwiał\w* (mi )?(połow|pół)|nie mogę (podnieść|ruszyć) (ręk|nog)/],
  ['sudden_severe_headache', /najgorszy ból głowy|nagły\w*,? (bardzo )?silny\w* ból głowy|jak uderzenie pioruna/],
  ['loss_of_consciousness', /(s)?traci\w* przytomn|utrat\w* przytomn|zemdl|omdl/],
  ['severe_bleeding', /krwotok|(silnie|mocno|bardzo) krwawi|nie (mogę|da się) zatamować|leje się krew/],
  ['anaphylaxis_signs', /(puchnie|spuchł\w*|obrzęk\w*) (mi )?(gardł|język|twarz|ust|krtani)/],
  ['suicidal_thoughts', /samobój|odebrać sobie życie|zabić się|nie chcę (już )?żyć|skończyć ze sobą/],
];

export function detectRedFlagPhrases(text: string): RedFlag[] {
  const t = text.toLowerCase();
  return PATTERNS.filter(([, re]) => re.test(t)).map(([flag]) => flag);
}
