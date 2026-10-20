// Klucz BYOK i ID modeli w szyfrowanym magazynie systemowym. Nic nie trafia do kodu ani EXPO_PUBLIC_*.
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_LLM_MODEL, DEFAULT_STT_MODEL } from '../config';

const API_KEY = 'groq_api_key';
const STT_MODEL = 'groq_stt_model';
const LLM_MODEL = 'groq_llm_model';

export type Models = { stt: string; llm: string };

export function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY);
}

export function setApiKey(key: string): Promise<void> {
  return SecureStore.setItemAsync(API_KEY, key);
}

export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY);
}

export async function getModels(): Promise<Models> {
  const [stt, llm] = await Promise.all([
    SecureStore.getItemAsync(STT_MODEL),
    SecureStore.getItemAsync(LLM_MODEL),
  ]);
  return { stt: stt || DEFAULT_STT_MODEL, llm: llm || DEFAULT_LLM_MODEL };
}

export async function setModels(models: Models): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(STT_MODEL, models.stt.trim() || DEFAULT_STT_MODEL),
    SecureStore.setItemAsync(LLM_MODEL, models.llm.trim() || DEFAULT_LLM_MODEL),
  ]);
}
