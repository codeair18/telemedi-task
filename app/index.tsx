import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Link, router, Stack, useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Linking, ScrollView, Share, Text, View } from 'react-native';
import { GroqError, nextTurn, transcribe } from '../src/ai/groq';
import { buildTurnInput } from '../src/ai/prompt';
import { FIRST_RECORDING_LIMIT_S, MAX_FOLLOWUPS, NEXT_RECORDING_LIMIT_S } from '../src/config';
import { initialState, reducer, type Action, type InterviewState } from '../src/interview/machine';
import {
  missingAll,
  RED_FLAG_LABELS,
  SLOT_GAP_LABELS,
  SLOT_KEYS,
  SLOT_PATIENT_LABELS,
} from '../src/interview/slots';
import { isEmptyTranscript } from '../src/interview/transcript';
import { getApiKey, getModels, type Models } from '../src/storage/keys';
import { formatNote } from '../src/summary/formatNote';
import { BigButton, Busy, Card, colors, styles } from '../src/ui/kit';

const DISCLAIMER = 'To nie jest porada medyczna. W nagłym przypadku dzwoń 112.';
const MIN_RECORDING_MS = 700;

function deleteRecording(uri: string | null) {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Plik mógł już zniknąć z cache; nic nie tracimy.
  }
}

function formatSeconds(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Interview() {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState);
  // Lustro stanu dla kodu asynchronicznego: reducer jest czysty, więc liczymy kolejny stan tak samo jak React.
  const stateRef = useRef<InterviewState>(state);
  const dispatch = useCallback((action: Action) => {
    stateRef.current = reducer(stateRef.current, action);
    rawDispatch(action);
  }, []);

  const creds = useRef<{ key: string; models: Models } | null>(null);
  const audioUri = useRef<string | null>(null);
  const stopping = useRef(false);
  const [micDenied, setMicDenied] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  // Bez klucza do Ustawień; po powrocie z Ustawień czytamy klucz i modele od nowa.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const key = await getApiKey();
        if (!key) {
          router.replace('/settings');
          return;
        }
        creds.current = { key, models: await getModels() };
      })();
    }, []),
  );

  // Pytanie zawsze widać jako tekst; TTS to dodatek.
  useEffect(() => {
    if (state.phase === 'asking') Speech.speak(state.question, { language: 'pl-PL' });
    return () => {
      Speech.stop();
    };
  }, [state.phase, state.question]);

  const recordingLimitS =
    state.turns.length === 0 && state.mode === 'interview' ? FIRST_RECORDING_LIMIT_S : NEXT_RECORDING_LIMIT_S;

  async function runAnalyze() {
    const c = creds.current;
    if (!c) return;
    const s = stateRef.current;
    const input = buildTurnInput({
      turns: s.turns,
      slots: s.slots,
      followupsAsked: s.followupsAsked,
      flags: s.flags,
      allowQuestion: s.mode === 'interview',
    });
    try {
      const result = await nextTurn(input, c.key, c.models.llm);
      dispatch({ type: 'analyzed', result });
    } catch (e) {
      dispatch({ type: 'failed', kind: e instanceof GroqError ? e.kind : 'bad_response', stage: 'analyze' });
    }
  }

  async function runTranscribe() {
    const c = creds.current;
    const uri = audioUri.current;
    if (!c || !uri) {
      dispatch({ type: 'transcript_empty' });
      return;
    }
    let text: string;
    try {
      text = await transcribe({ uri }, c.key, c.models.stt);
    } catch (e) {
      // Nagranie zostaje do ponowienia.
      dispatch({ type: 'failed', kind: e instanceof GroqError ? e.kind : 'network', stage: 'transcribe' });
      return;
    }
    deleteRecording(uri);
    audioUri.current = null;
    if (isEmptyTranscript(text)) {
      dispatch({ type: 'transcript_empty' });
      return;
    }
    dispatch({ type: 'transcribed', text });
    await runAnalyze();
  }

  async function startRecording() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    await Speech.stop();
    deleteRecording(audioUri.current);
    audioUri.current = null;
    stopping.current = false;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: recordingLimitS });
    dispatch({ type: 'record_start' });
  }

  async function stopRecording() {
    if (stopping.current) return;
    stopping.current = true;
    const durationMs = recorderState.durationMillis;
    await recorder.stop();
    // iOS: bez tego TTS gra cicho przez słuchawkę rozmów.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    audioUri.current = recorder.uri;
    dispatch({ type: 'record_stop' });
    if (durationMs < MIN_RECORDING_MS) {
      deleteRecording(audioUri.current);
      audioUri.current = null;
      dispatch({ type: 'transcript_empty' });
      return;
    }
    await runTranscribe();
  }

  // Automatyczny stop po limicie (recorder zatrzymuje się sam przez forDuration, ale fazę zmieniamy tutaj).
  useEffect(() => {
    if (state.phase !== 'recording') return;
    const hitLimit = recorderState.durationMillis >= recordingLimitS * 1000;
    const stoppedNatively = !recorderState.isRecording && recorderState.durationMillis > 0;
    if (hitLimit || stoppedNatively) stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, recorderState.durationMillis, recorderState.isRecording]);

  function retry() {
    const stage = stateRef.current.error?.stage;
    dispatch({ type: 'retry' });
    if (stage === 'transcribe') runTranscribe();
    else runAnalyze();
  }

  async function share() {
    const s = stateRef.current;
    const message = formatNote({ slots: s.slots, flags: s.flags, turns: s.turns, date: new Date() });
    const result = await Share.share({ message, title: 'Wywiad wstępny przed teleporadą' });
    if (result.action === Share.sharedAction) dispatch({ type: 'shared' });
  }

  function reset() {
    Speech.stop();
    deleteRecording(audioUri.current);
    audioUri.current = null;
    dispatch({ type: 'reset' });
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" style={{ fontSize: 17, color: colors.primary, padding: 8 }}>
              Ustawienia
            </Link>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.screen}>
        {state.phase === 'intro' && <Intro onStart={() => dispatch({ type: 'start' })} />}

        {(state.phase === 'asking' || state.phase === 'recording') && (
          <Asking
            state={state}
            recording={state.phase === 'recording'}
            elapsedMs={recorderState.durationMillis}
            limitS={recordingLimitS}
            micDenied={micDenied}
            onRecord={startRecording}
            onStop={stopRecording}
            onRerecord={() => dispatch({ type: 'rerecord' })}
            onRepeat={() => Speech.speak(state.question, { language: 'pl-PL' })}
          />
        )}

        {state.phase === 'processing' && <Busy label="Słucham i porządkuję odpowiedź…" />}

        {state.phase === 'redflag' && (
          <RedFlagScreen state={state} onContinue={() => dispatch({ type: 'dismiss_flag' })} />
        )}

        {state.phase === 'error' && <ErrorScreen state={state} onRetry={retry} />}

        {state.phase === 'review' && (
          <Review
            state={state}
            onConfirm={share}
            onAddMore={() => dispatch({ type: 'add_more' })}
            onRerecord={() => dispatch({ type: 'rerecord' })}
          />
        )}

        {state.phase === 'shared' && (
          <>
            <Text style={styles.title}>Notatka udostępniona ✓</Text>
            <Text style={styles.body}>Lekarz przeczyta ją przed rozmową. Proszę czekać na telefon.</Text>
            <BigButton label="Udostępnij ponownie" variant="secondary" onPress={share} />
            <BigButton label="Nowy wywiad" onPress={reset} />
          </>
        )}
      </ScrollView>
    </>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <>
      <Text style={styles.title}>Przygotuję notatkę dla lekarza, zanim zadzwoni.</Text>
      <Text style={styles.body}>
        Opowiesz głosem, co dolega. Dopytam tylko o to, czego zabraknie. Zajmie to 2–3 minuty.
      </Text>
      <Card>
        <Text style={styles.body}>
          Nagranie zostanie wysłane do Groq w celu zamiany na tekst. Nie zapisujemy nagrań.
        </Text>
      </Card>
      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      <BigButton label="Zaczynamy" onPress={onStart} />
    </>
  );
}

function Asking(props: {
  state: InterviewState;
  recording: boolean;
  elapsedMs: number;
  limitS: number;
  micDenied: boolean;
  onRecord: () => void;
  onStop: () => void;
  onRerecord: () => void;
  onRepeat: () => void;
}) {
  const { state, recording } = props;
  const progress =
    state.mode === 'extra'
      ? 'Dodatkowa informacja'
      : state.followupsAsked > 0
        ? `Pytanie uzupełniające ${state.followupsAsked} z ${MAX_FOLLOWUPS}`
        : null;
  return (
    <>
      {state.heard && !recording && (
        <Card>
          <Text style={styles.label}>Usłyszałem:</Text>
          <Text style={styles.body}>„{state.heard}”</Text>
          <BigButton label="Nagraj ponownie" variant="secondary" onPress={props.onRerecord} />
        </Card>
      )}
      {state.notice && !recording && <Text style={[styles.body, { fontWeight: '700' }]}>{state.notice}</Text>}
      {progress && <Text style={styles.muted}>{progress}</Text>}
      <Text style={styles.question}>{state.question}</Text>

      {props.micDenied && (
        <Card>
          <Text style={styles.body}>
            Bez dostępu do mikrofonu nie da się nagrać odpowiedzi. Proszę zezwolić na mikrofon w
            ustawieniach telefonu.
          </Text>
          <BigButton label="Otwórz ustawienia telefonu" variant="secondary" onPress={() => Linking.openSettings()} />
        </Card>
      )}

      {recording ? (
        <>
          <Text style={[styles.title, { textAlign: 'center' }]}>
            ● {formatSeconds(props.elapsedMs)} / {formatSeconds(props.limitS * 1000)}
          </Text>
          <BigButton
            label="■  Dotknij, aby skończyć"
            variant="danger"
            onPress={props.onStop}
            style={{ minHeight: 120 }}
          />
        </>
      ) : (
        <>
          <BigButton label="🎤  Dotknij, aby mówić" onPress={props.onRecord} style={{ minHeight: 120 }} />
          <BigButton label="Powtórz pytanie" variant="secondary" onPress={props.onRepeat} />
        </>
      )}
      <Text style={styles.muted}>{DISCLAIMER}</Text>
    </>
  );
}

function RedFlagScreen({ state, onContinue }: { state: InterviewState; onContinue: () => void }) {
  return (
    <View style={{ flex: 1, gap: 20, backgroundColor: colors.dangerBg, padding: 20, borderRadius: 16 }}>
      <Text style={[styles.title, { color: colors.danger, fontSize: 30 }]}>
        Opisane objawy mogą wymagać pilnej pomocy.
      </Text>
      <Text style={[styles.body, { fontSize: 22, lineHeight: 30, fontWeight: '600' }]}>
        Zadzwoń pod 112 albo jedź na SOR. Nie czekaj na teleporadę.
      </Text>
      <Text style={styles.muted}>Zauważone: {state.newFlags.map((f) => RED_FLAG_LABELS[f]).join(', ')}</Text>
      <BigButton
        label="📞  Zadzwoń 112"
        variant="danger"
        onPress={() => Linking.openURL('tel:112')}
        style={{ minHeight: 100 }}
      />
      <BigButton label="To nie to, kontynuuj" variant="secondary" onPress={onContinue} />
    </View>
  );
}

const ERROR_MESSAGES = {
  auth: 'Klucz Groq nie działa. Sprawdź go w Ustawieniach. Odpowiedzi zostają zapisane w tym wywiadzie.',
  rate: 'Za dużo zapytań. Spróbuj za chwilę.',
  network: 'Brak połączenia z internetem albo serwer nie odpowiada. Odpowiedzi nie przepadły.',
  bad_response: 'Nie udało się przetworzyć nagrania. Spróbuj ponownie.',
} as const;

function ErrorScreen({ state, onRetry }: { state: InterviewState; onRetry: () => void }) {
  const kind = state.error?.kind ?? 'network';
  return (
    <>
      <Text style={styles.title}>Coś poszło nie tak</Text>
      <Text style={styles.body}>{ERROR_MESSAGES[kind]}</Text>
      {kind === 'auth' && <BigButton label="Przejdź do Ustawień" onPress={() => router.push('/settings')} />}
      <BigButton label="Ponów" variant={kind === 'auth' ? 'secondary' : 'primary'} onPress={onRetry} />
    </>
  );
}

function Review(props: {
  state: InterviewState;
  onConfirm: () => void;
  onAddMore: () => void;
  onRerecord: () => void;
}) {
  const { state } = props;
  const gaps = missingAll(state.slots);
  return (
    <>
      <Text style={styles.title}>Czy dobrze zrozumiałem?</Text>
      {state.notice && <Text style={[styles.body, { fontWeight: '700' }]}>{state.notice}</Text>}
      {state.flags.length > 0 && (
        <Text style={styles.disclaimer}>
          ⚠ Zgłoszone objawy alarmowe: {state.flags.map((f) => RED_FLAG_LABELS[f]).join(', ')}. W razie
          pogorszenia dzwoń 112.
        </Text>
      )}
      {SLOT_KEYS.filter((k) => state.slots[k].value !== null).map((k) => (
        <Card key={k}>
          <Text style={styles.label}>{SLOT_PATIENT_LABELS[k]}</Text>
          <Text style={styles.body}>{state.slots[k].value}</Text>
          {state.slots[k].quote && <Text style={styles.muted}>„{state.slots[k].quote}”</Text>}
        </Card>
      ))}
      {gaps.length > 0 && (
        <Card style={{ backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.border }}>
          <Text style={styles.label}>Nie ustalono</Text>
          <Text style={styles.body}>{gaps.map((k) => SLOT_GAP_LABELS[k]).join(', ')}</Text>
          <Text style={styles.muted}>Lekarz zapyta o to w rozmowie.</Text>
        </Card>
      )}
      <BigButton label="Wszystko się zgadza" onPress={props.onConfirm} />
      {!state.extraUsed && <BigButton label="Chcę coś dodać" variant="secondary" onPress={props.onAddMore} />}
      {state.turns.length > 0 && (
        <BigButton label="Nagraj ponownie ostatnią odpowiedź" variant="secondary" onPress={props.onRerecord} />
      )}
      <Text style={styles.muted}>{DISCLAIMER}</Text>
    </>
  );
}
