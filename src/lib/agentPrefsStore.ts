import { NO_PREFS, type AgentPrefs } from './agentMemory';
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
