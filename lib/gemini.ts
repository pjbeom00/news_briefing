// lib/gemini.ts

import { GoogleGenAI } from "@google/genai";
import { getEnv } from "./env";
import { sleep } from "./sleep";

type GenerateTextOptions = {
  prompt: string;
  model?: string;
  maxRetries?: number;
};

function createGeminiClient() {
  const env = getEnv();

  return new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
  });
}

function getRetryDelayMs(error: unknown, fallbackMs = 15000): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    const match = message.match(/retry in (\d+(\.\d+)?)s/i);

    if (match) {
      const seconds = Number(match[1]);
      if (!Number.isNaN(seconds)) {
        return Math.ceil(seconds * 1000);
      }
    }
  }

  return fallbackMs;
}

function isQuotaError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 429
  ) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: string }).message === "string"
  ) {
    const message = (error as { message: string }).message;

    return (
      message.includes("RESOURCE_EXHAUSTED") ||
      message.includes("Quota exceeded") ||
      message.includes('"code":429')
    );
  }

  return false;
}

export async function generateTextWithRetry({
  prompt,
  model = "gemini-2.5-flash",
  maxRetries = 2,
}: GenerateTextOptions): Promise<string> {
  const ai = createGeminiClient();

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      return response.text ?? "";
    } catch (error) {
      lastError = error;

      if (!isQuotaError(error)) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, 15000);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
