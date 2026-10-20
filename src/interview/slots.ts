export const SLOT_KEYS = [
  'chief_complaint',
  'onset',
  'severity',
  'associated_symptoms',
  'medications',
  'allergies',
  'chronic_conditions',
  'patient_goal',
] as const;

export type SlotKey = (typeof SLOT_KEYS)[number];

export type Slot = { value: string | null; quote: string | null };
export type Slots = Record<SlotKey, Slot>;

export const REQUIRED_SLOTS: readonly SlotKey[] = [
  'chief_complaint',
  'onset',
  'medications',
  'allergies',
  'patient_goal',
];

// Etykieta w notatce dla lekarza.
export const SLOT_LABELS: Record<SlotKey, string> = {
  chief_complaint: 'Powód zgłoszenia',
  onset: 'Od kiedy',
  severity: 'Nasilenie, wpływ na codzienność',
  associated_symptoms: 'Inne objawy',
  medications: 'Leki (stałe i przyjęte na ten problem)',
  allergies: 'Alergie, zwłaszcza na leki',
  chronic_conditions: 'Choroby przewlekłe',
  patient_goal: 'Oczekiwanie wobec wizyty',
};

// Krótka forma do listy „Nie ustalono”.
export const SLOT_GAP_LABELS: Record<SlotKey, string> = {
  chief_complaint: 'powód zgłoszenia',
  onset: 'od kiedy',
  severity: 'nasilenie',
  associated_symptoms: 'inne objawy',
  medications: 'leki',
  allergies: 'alergie',
  chronic_conditions: 'choroby przewlekłe',
  patient_goal: 'oczekiwanie wobec wizyty',
};

// Prosty język na ekranie „Czy dobrze zrozumiałem?”.
export const SLOT_PATIENT_LABELS: Record<SlotKey, string> = {
  chief_complaint: 'Co dolega',
  onset: 'Od kiedy',
  severity: 'Jak bardzo przeszkadza',
  associated_symptoms: 'Inne objawy',
  medications: 'Leki',
  allergies: 'Uczulenia',
  chronic_conditions: 'Choroby przewlekłe',
  patient_goal: 'Czego oczekuje się od lekarza',
};

export const RED_FLAGS = [
  'chest_pain',
  'breathing_difficulty',
  'stroke_signs',
  'sudden_severe_headache',
  'loss_of_consciousness',
  'severe_bleeding',
  'anaphylaxis_signs',
  'suicidal_thoughts',
] as const;

export type RedFlag = (typeof RED_FLAGS)[number];

export const RED_FLAG_LABELS: Record<RedFlag, string> = {
  chest_pain: 'ból w klatce piersiowej',
  breathing_difficulty: 'trudności w oddychaniu',
  stroke_signs: 'objawy mogące wskazywać na udar',
  sudden_severe_headache: 'nagły, silny ból głowy',
  loss_of_consciousness: 'utrata przytomności',
  severe_bleeding: 'silne krwawienie',
  anaphylaxis_signs: 'objawy ciężkiej reakcji alergicznej',
  suicidal_thoughts: 'myśli samobójcze',
};

export function emptySlots(): Slots {
  return Object.fromEntries(SLOT_KEYS.map((k) => [k, { value: null, quote: null }])) as Slots;
}

export function missingRequired(slots: Slots): SlotKey[] {
  return REQUIRED_SLOTS.filter((k) => slots[k].value === null);
}

export function missingAll(slots: Slots): SlotKey[] {
  return SLOT_KEYS.filter((k) => slots[k].value === null);
}
