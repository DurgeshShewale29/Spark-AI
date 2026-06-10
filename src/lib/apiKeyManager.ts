export function getAvailableApiKey(customKey?: string | null): string {
  // 1. If the user provided their own key in the UI settings, ALWAYS use theirs first
  if (customKey) return customKey;

  const keys: string[] = [];

  // 2. Loop through and grab all Groq ALT keys
  for (let i = 1; i <= 20; i++) {
    const altKey = process.env[`API_KEY_ALT_${i}`];
    if (altKey && altKey.startsWith('gsk_')) {
      keys.push(altKey);
    }
  }

  // 3. Safety Check
  if (keys.length === 0) {
    throw new Error("CRITICAL: No Groq API keys found in environment variables.");
  }

  // 4. Pick a completely random key from the pool
  const randomIndex = Math.floor(Math.random() * keys.length);
  return keys[randomIndex];
}