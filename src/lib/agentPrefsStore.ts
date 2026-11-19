import { NO_PREFS, type AgentPrefs, type Fact } from './agentMemory';
import { getPhoneFlag, setPhoneFlag } from './phoneFlags';

/** Lo que pausaste u olvidaste de Agent: vive en este teléfono. */
export async function loadAgentPrefs(): Promise<AgentPrefs> {
  try {
    const paused = JSON.parse((await getPhoneFlag('agent-paused')) ?? '[]') as unknown;
    return { paused: Array.isArray(paused) ? paused.filter((x): x is string => typeof x === 'string') : [], forgetBefore: await getPhoneFlag('agent-forget-before') };
  } catch {
    return NO_PREFS;
  }
}

export async function saveAgentPrefs(p: AgentPrefs): Promise<void> {
  await setPhoneFlag('agent-paused', JSON.stringify(p.paused));
  await setPhoneFlag('agent-forget-before', p.forgetBefore ?? '');
}

/** Lo que aceptaste que Agent recuerde (hoy: tu talla). Solo en este teléfono. */
export async function loadFacts(): Promise<Fact[]> {
  try {
    const raw = JSON.parse((await getPhoneFlag('agent-facts')) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as Fact[]).filter((f) => f && typeof f.value === 'string') : [];
  } catch {
    return [];
  }
}

export async function rememberFact(f: Fact): Promise<Fact[]> {
  const list = (await loadFacts()).filter((x) => x.name !== f.name);
  const next = [...list, f];
  await setPhoneFlag('agent-facts', JSON.stringify(next));
  return next;
}

export async function forgetFact(name: Fact['name']): Promise<Fact[]> {
  const next = (await loadFacts()).filter((x) => x.name !== name);
  await setPhoneFlag('agent-facts', JSON.stringify(next));
  return next;
}

/** Lo que dijiste que no recuerde: no se vuelve a preguntar por ese mismo valor. */
export async function declineFact(value: string): Promise<void> {
  await setPhoneFlag('agent-facts-declined', value);
}

export async function declinedFact(): Promise<string | null> {
  return getPhoneFlag('agent-facts-declined');
}
