// Deterministyczna notatka dla lekarza z pól JSON (intent.md 5.4). Model nie pisze tu nic od siebie.
import type { Turn } from '../ai/prompt';
import {
  missingAll,
  RED_FLAG_LABELS,
  SLOT_GAP_LABELS,
  SLOT_KEYS,
  SLOT_LABELS,
  type RedFlag,
  type Slots,
} from '../interview/slots';

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatNote(args: { slots: Slots; flags: RedFlag[]; turns: Turn[]; date: Date }): string {
  const { slots, flags, turns, date } = args;
  const lines: string[] = [
    'WYWIAD WSTĘPNY PRZED TELEPORADĄ',
    'Zebrany głosowo od pacjenta przez asystenta AI. Niezweryfikowany przez personel medyczny.',
    `Data: ${formatDate(date)}`,
    '',
    `⚠ SYGNAŁY ALARMOWE: ${flags.length ? flags.map((f) => RED_FLAG_LABELS[f]).join(', ') : 'brak'}`,
  ];
  if (flags.length) {
    lines.push('  Pacjentowi pokazano komunikat o 112; wywiad kontynuowano.');
  }
  lines.push('');

  for (const k of SLOT_KEYS) {
    const { value, quote } = slots[k];
    if (value === null) continue;
    lines.push(`${SLOT_LABELS[k]}: ${value}`);
    if (quote) lines.push(`  „${quote}”`);
  }

  const gaps = missingAll(slots);
  lines.push('', `Nie ustalono: ${gaps.length ? gaps.map((k) => SLOT_GAP_LABELS[k]).join(', ') : '—'}`);

  lines.push('', '--- Pełna transkrypcja ---');
  for (const t of turns) {
    lines.push(`Asystent: ${t.question}`, `Pacjent: ${t.answer}`);
  }
  return lines.join('\n');
}
