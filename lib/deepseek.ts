import OpenAI from "openai";

export function getDeepSeekApiKey(): string | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

export function createDeepSeekClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });
}

export async function testDeepSeekConnection(apiKey: string): Promise<string> {
  const client = createDeepSeekClient(apiKey);
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    max_tokens: 5,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "Reply with exactly OK",
      },
      {
        role: "user",
        content: "Connection test",
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
