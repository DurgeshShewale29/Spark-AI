export function getAvailableGeminiKey(customKey?: string | null): string {
  // 1. If the user provided their own key in the UI settings, ALWAYS use theirs first
  if (customKey) return customKey;

  const keys: string[] = [];

  // 2. Add the base keys
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);

  // 3. Loop through and grab all 20 ALT keys
  for (let i = 1; i <= 20; i++) {
    const altKey = process.env[`GEMINI_API_KEY_ALT_${i}`];
    if (altKey) {
      keys.push(altKey);
    }
  }

  // 4. Safety Check
  if (keys.length === 0) {
    throw new Error("CRITICAL: No Gemini API keys found in environment variables.");
  }

  // 5. Pick a completely random key from the pool
  const randomIndex = Math.floor(Math.random() * keys.length);
  return keys[randomIndex];
}