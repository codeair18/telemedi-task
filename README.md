# Poczekalnia: głosowy wywiad przed teleporadą

Pacjent czekający na teleporadę opowiada głosem, co mu dolega. Aplikacja dopytuje tylko o brakujące informacje (maksymalnie 4 pytania) i przygotowuje dla lekarza notatkę z cytatami pacjenta, jawną listą luk i ewentualnymi sygnałami alarmowymi.

Pełne uzasadnienie, zakres i kontrakt AI są w [`intent.md`](intent.md).

## Uruchomienie

Wymagania: Node 22+, telefon z aplikacją **Expo Go** (SDK 58) w tej samej sieci Wi-Fi co komputer.

```bash
npm install
npx expo start        # zeskanuj kod QR w Expo Go (Android) albo aparatem (iOS)
```

Przy pierwszym uruchomieniu aplikacja otwiera **Ustawienia**. Wklej tam klucz Groq i naciśnij „Sprawdź klucz”.

### Skąd wziąć klucz Groq

1. Załóż darmowe konto na <https://console.groq.com>.
2. Wejdź w **API Keys → Create API Key** i skopiuj klucz (`gsk_…`).
3. Wklej go w Ustawieniach aplikacji. Klucz jest przechowywany tylko w `expo-secure-store` na telefonie.

Darmowy tier Groq wystarcza zarówno na transkrypcję (`whisper-large-v3`), jak i na model językowy (`openai/gpt-oss-120b`). Jeśli któryś model zostanie wycofany, jego ID zmienisz w **Ustawienia → Zaawansowane**.

### Sprawdzenie bez telefonu

```bash
npm test                                   # reducer, scalanie pól, warunki końca, notatka, frazy alarmowe
npm run typecheck
GROQ_API_KEY=gsk_... npm run try-turn      # scenariusze A i B z intent.md na prawdziwym modelu
```

## Jak to działa

```
nagranie (expo-audio, .m4a) → Groq Whisper (pl) → Groq gpt-oss-120b (strict JSON)
   → reducer: scalenie pól, flagi, warunki końca → pytanie (tekst + expo-speech) albo podsumowanie
   → notatka składana deterministycznie z pól → Share.share
```

- `src/interview/machine.ts`: czysty reducer z fazami, scalaniem pól (`nowe ?? stare`) i warunkami końca. To aplikacja, a nie model, decyduje o końcu wywiadu.
- `src/ai/groq.ts`: `fetch` bez SDK, działa w RN i w Node.
- `src/ai/prompt.ts`: prompt systemowy i schemat JSON (`strict: true`).
- `src/summary/formatNote.ts`: notatka dla lekarza. Model nie pisze w niej nic od siebie.

## Dlaczego ten problem

Wywiad to opowieść, a pacjent jest chory, często starszy i ma w ręku telefon, więc mówienie jest dla niego łatwiejsze niż pisanie. Problem ma wyraźny koniec (notatka dla lekarza), więc w 2 godziny da się dowieźć jedną pełną ścieżkę. Ryzyko jest kontrolowane, bo aplikacja zbiera i porządkuje informacje, a nie je ocenia. Odrzucone pomysły (triage, przypomnienia o lekach, dziennik objawów, wyniki badań) są opisane w `intent.md`, sekcja 3.

## Co odciąłem

- Backend i panel lekarza. Notatka trafia do lekarza przez systemowe „Udostępnij”.
- Konta, historię i trwały zapis. Wywiad żyje tylko w pamięci, a nagrania są kasowane po transkrypcji.
- Rozmowę realtime i TTS premium. Tury nagrywane przyciskiem w zupełności wystarczają.
- Wersję web i inne języki niż polski.
- Testy E2E i CI. Czysta logika ma testy jednostkowe (`npm test`).

## Decyzje podjęte w trakcie budowy

- **Drugie zabezpieczenie dla flag alarmowych** (`src/interview/redFlagPhrases.ts`). Obok modelu działa deterministyczna lista fraz („klatka piersiowa”, „duszność”, „zemdlałem”…). Jest celowo szeroka i nie rozpoznaje zaprzeczeń, więc zdanie „nie boli mnie w klatce” też pokaże ekran 112. Fałszywy alarm kosztuje jedno dotknięcie „To nie to, kontynuuj”, a przegapiony sygnał może kosztować znacznie więcej.
- **„Nagraj ponownie” cofa turę.** Przywraca pola i licznik pytań sprzed tej odpowiedzi, ale nie cofa flag alarmowych: raz zgłoszony sygnał zostaje w notatce. Ten sam przycisk jest dostępny na ekranie podsumowania, przy ostatniej odpowiedzi.
- **Cisza.** Nagranie krótsze niż 0,7 s oraz typowe „halucynacje” Whispera na ciszy („Dziękuję.”, „Napisy wykonane przez…”) traktujemy jako brak odpowiedzi. Nie zużywają tury.
- **Błędy.** Zła odpowiedź modelu (po jednym ponowieniu) prowadzi do podsumowania z tym, co już jest, plus pełna transkrypcja. Brak sieci, 429 i 401 dają „Ponów” bez utraty odpowiedzi, a nagranie zostaje do ponowienia.
- **„Powtórz pytanie”** czyta pytanie ponownie przez TTS. Bez tego po przegapieniu mowy pytanie dałoby się tylko przeczytać.
- **`reasoning_effort: "low"` i `include_reasoning: false`** dla gpt-oss: mniejsze opóźnienie, a rozumowanie nie wraca w odpowiedzi.

## Blokery produkcyjne (nierozwiązane)

- Dane o zdrowiu to szczególna kategoria danych (RODO, art. 9). Potrzebna jest umowa powierzenia z dostawcą AI i weryfikacja lokalizacji przetwarzania.
- Klucz na urządzeniu działa tylko w PoC. W produkcji potrzebny jest backend-proxy z limitami i logiem audytowym.
- Lista flag alarmowych nie jest walidowana klinicznie. Trzeba też ocenić, czy ta funkcja nie czyni aplikacji wyrobem medycznym (MDR).

## Zrzuty ekranu

W katalogu [`screenshots/`](screenshots/): start, pytanie, podsumowanie, ekran 112.
