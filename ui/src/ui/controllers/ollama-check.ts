export type OllamaStatus = { available: boolean; models: string[] };

/**
 * Check if Ollama is running locally by hitting the tags endpoint.
 */
export async function checkOllamaAvailability(): Promise<OllamaStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { available: false, models: [] };
    }
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}
