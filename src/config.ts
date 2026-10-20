// Domyślne ID modeli Groq (sprawdzone 2026-10-20: oba produkcyjne, gpt-oss-120b wspiera strict json_schema).
// Modele bywają wycofywane, więc można je nadpisać w Ustawieniach → Zaawansowane.
export const DEFAULT_STT_MODEL = 'whisper-large-v3';
export const DEFAULT_LLM_MODEL = 'openai/gpt-oss-120b';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const REQUEST_TIMEOUT_MS = 20_000;

// Limity wywiadu egzekwowane przez aplikację, nie przez model (intent.md 5.3).
export const MAX_FOLLOWUPS = 4;
export const FIRST_RECORDING_LIMIT_S = 120;
export const NEXT_RECORDING_LIMIT_S = 60;

// Podpowiedź dla Whispera, podbija rozpoznawanie słownictwa medycznego.
export const STT_PROMPT = 'Wywiad lekarski przed teleporadą. Objawy, nazwy leków.';

export const OPENING_QUESTION =
  'Proszę opowiedzieć własnymi słowami, co się dzieje: od kiedy i co najbardziej niepokoi.';
export const EXTRA_QUESTION = 'Proszę powiedzieć, co jeszcze warto przekazać lekarzowi.';
