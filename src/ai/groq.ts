// Klient Groq na czystym fetch: bez importów z React Native, działa też w Node (scripts/try-turn.ts).
import { GROQ_BASE_URL, REQUEST_TIMEOUT_MS, STT_PROMPT } from '../config';
import { RED_FLAGS, SLOT_KEYS, type RedFlag, type Slot } from '../interview/slots';
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, type TurnInput, type TurnResult } from './prompt';

export type GroqErrorKind = 'auth' | 'rate' | 'network' | 'bad_response';

export class GroqError extends Error {
  constructor(
    public kind: GroqErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}


async function groqFetch(path: string, key: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${GROQ_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...init.headers },
      signal: controller.signal,
    });
  } catch (e) {
    const cause = controller.signal.aborted
      ? `przekroczono czas ${REQUEST_TIMEOUT_MS / 1000} s`
      : e instanceof Error
        ? `${e.name}: ${e.message}`
        : String(e);
    throw new GroqError('network', `${path}: ${cause}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new GroqError('auth', 'Klucz nie działa.');
  if (res.status === 429) throw new GroqError('rate', 'Za dużo zapytań.');
  if (!res.ok) {
    // Treść błędu bywa pomocna przy diagnozie (np. wycofany model), nie zawiera danych pacjenta.
    const body = await res.text().catch(() => '');
    throw new GroqError(
      res.status >= 500 ? 'network' : 'bad_response',
      `${path}: HTTP ${res.status} ${body.slice(0, 300)}`,
    );
  }
  return res;
}

export async function checkKey(key: string): Promise<'ok' | GroqErrorKind> {
  try {
    await groqFetch('/models', key);
    return 'ok';
  } catch (e) {
    return e instanceof GroqError ? e.kind : 'network';
  }
}

// audio: w Node zwykły Blob; w aplikacji File z expo-file-system (implementuje Blob).
// Expo podmienia globalny fetch na expo/fetch, który nie obsługuje RN-owego { uri, name, type }.
export async function transcribe(audio: Blob, key: string, model: string): Promise<string> {
  const form = new FormData();
  form.append('file', audio, 'answer.m4a');
  form.append('model', model);
  form.append('language', 'pl');
  form.append('response_format', 'json');
  form.append('prompt', STT_PROMPT);

  const res = await groqFetch('/audio/transcriptions', key, { method: 'POST', body: form });
  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === 'string' ? data.text.trim() : '';
}

async function requestTurn(input: TurnInput, key: string, model: string): Promise<TurnResult> {
  const res = await groqFetch('/chat/completions', key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      reasoning_effort: 'low',
      include_reasoning: false,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'interview_turn', strict: true, schema: RESPONSE_SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        // Transkrypcja idzie jako dane w JSON, nie jako instrukcja.
        { role: 'user', content: JSON.stringify(input) },
      ],
    }),
  });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new GroqError('bad_response', 'Pusta odpowiedź modelu.');
  try {
    return parseTurnResult(JSON.parse(content));
  } catch {
    throw new GroqError('bad_response', 'Odpowiedź modelu nie pasuje do schematu.');
  }
}

// Strict mode gwarantuje schemat, ale sprawdzamy kształt, żeby błąd nie wyciekł do reducera.
function parseTurnResult(raw: unknown): TurnResult {
  const r = raw as Record<string, unknown>;
  const rawSlots = r.slots as Record<string, Slot> | undefined;
  if (!rawSlots || !Array.isArray(r.red_flags)) throw new Error('shape');
  const slots = Object.fromEntries(
    SLOT_KEYS.map((k) => {
      const s = rawSlots[k];
      const value = typeof s?.value === 'string' && s.value.trim() ? s.value.trim() : null;
      const quote = value && typeof s?.quote === 'string' && s.quote.trim() ? s.quote.trim() : null;
      return [k, { value, quote }];
    }),
  ) as TurnResult['slots'];
  return {
    slots,
    red_flags: r.red_flags.filter((f): f is RedFlag => (RED_FLAGS as readonly string[]).includes(f as string)),
    next_question:
      typeof r.next_question === 'string' && r.next_question.trim() ? r.next_question.trim() : null,
    patient_wants_to_finish: r.patient_wants_to_finish === true,
  };
}

// Jedno ponowienie przy błędzie sieci lub złej odpowiedzi; 401 i 429 od razu do UI.
export async function nextTurn(input: TurnInput, key: string, model: string): Promise<TurnResult> {
  try {
    return await requestTurn(input, key, model);
  } catch (e) {
    if (e instanceof GroqError && (e.kind === 'auth' || e.kind === 'rate')) throw e;
    return requestTurn(input, key, model);
  }
}
