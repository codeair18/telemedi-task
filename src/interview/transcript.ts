// Whisper na ciszy potrafi zwrócić typowe „halucynacje” z napisów filmowych. Traktujemy je jak brak odpowiedzi.
const SILENCE_HALLUCINATIONS = [
  'dziękuję',
  'dziękuję za uwagę',
  'dziękuję bardzo',
  'napisy wykonane przez',
  'napisy stworzone przez',
  'subskrybuj',
  'do zobaczenia',
];

export function isEmptyTranscript(text: string): boolean {
  const t = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 2) return true;
  return SILENCE_HALLUCINATIONS.some((h) => t === h || (h.startsWith('napisy') && t.startsWith(h)));
}
