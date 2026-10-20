import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { checkKey } from '../src/ai/groq';
import { deleteApiKey, getApiKey, getModels, setApiKey, setModels } from '../src/storage/keys';
import { BigButton, Card, colors, styles } from '../src/ui/kit';

type Status = { tone: 'ok' | 'error' | 'info'; text: string } | null;

const CHECK_MESSAGES: Record<string, Status> = {
  ok: { tone: 'ok', text: 'Klucz działa ✓' },
  auth: { tone: 'error', text: 'Klucz nie działa. Sprawdź, czy został skopiowany w całości.' },
  rate: { tone: 'info', text: 'Groq odpowiada „za dużo zapytań”, ale klucz zapisano. Spróbuj za chwilę.' },
  network: { tone: 'error', text: 'Brak połączenia z Groq. Sprawdź internet i spróbuj ponownie.' },
  bad_response: { tone: 'error', text: 'Groq zwrócił nieoczekiwaną odpowiedź. Spróbuj ponownie.' },
};

export default function Settings() {
  const [input, setInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [advanced, setAdvanced] = useState(false);
  const [stt, setStt] = useState('');
  const [llm, setLlm] = useState('');

  useEffect(() => {
    getApiKey().then((k) => setHasKey(!!k));
    getModels().then((m) => {
      setStt(m.stt);
      setLlm(m.llm);
    });
  }, []);

  async function onCheck() {
    const key = input.trim() || (await getApiKey());
    if (!key) {
      setStatus({ tone: 'error', text: 'Wklej klucz Groq (zaczyna się od „gsk_”).' });
      return;
    }
    setChecking(true);
    setStatus(null);
    const result = await checkKey(key);
    setChecking(false);
    setStatus(CHECK_MESSAGES[result]);
    if (result === 'ok' || result === 'rate') {
      await setApiKey(key);
      setHasKey(true);
      setInput('');
    }
  }

  async function onDelete() {
    await deleteApiKey();
    setHasKey(false);
    setStatus({ tone: 'info', text: 'Klucz usunięty z telefonu.' });
  }

  async function onSaveModels() {
    await setModels({ stt, llm });
    const m = await getModels();
    setStt(m.stt);
    setLlm(m.llm);
    setStatus({ tone: 'info', text: 'Zapisano modele.' });
  }

  const statusColor = status?.tone === 'ok' ? colors.ok : status?.tone === 'error' ? colors.danger : colors.text;

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.body}>
        Aplikacja korzysta z Groq do zamiany mowy na tekst i porządkowania wywiadu. Klucz API założysz za
        darmo na console.groq.com → API Keys.
      </Text>

      <Text style={styles.label}>Klucz Groq</Text>
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder={hasKey ? 'Klucz zapisany (••••). Wklej nowy, aby zmienić.' : 'gsk_…'}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <BigButton label={checking ? 'Sprawdzam…' : 'Sprawdź klucz'} onPress={onCheck} disabled={checking} />
      {status && <Text style={[styles.body, { color: statusColor, fontWeight: '700' }]}>{status.text}</Text>}

      {hasKey && <BigButton label="Przejdź do wywiadu" onPress={() => router.replace('/')} />}
      {hasKey && <BigButton label="Usuń klucz" variant="secondary" onPress={onDelete} />}

      <BigButton
        label={advanced ? 'Ukryj zaawansowane' : 'Zaawansowane'}
        variant="secondary"
        onPress={() => setAdvanced((a) => !a)}
      />
      {advanced && (
        <Card>
          <Text style={styles.muted}>
            ID modeli Groq. Zmień tylko, jeśli domyślny model zostanie wycofany. Model językowy musi
            wspierać structured outputs w trybie strict.
          </Text>
          <Text style={styles.label}>Mowa na tekst</Text>
          <TextInput style={styles.input} value={stt} onChangeText={setStt} autoCapitalize="none" autoCorrect={false} />
          <Text style={styles.label}>Model językowy</Text>
          <TextInput style={styles.input} value={llm} onChangeText={setLlm} autoCapitalize="none" autoCorrect={false} />
          <View>
            <BigButton label="Zapisz modele" onPress={onSaveModels} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
