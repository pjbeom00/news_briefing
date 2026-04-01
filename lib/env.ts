// lib/env.ts

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`환경변수 ${name} 가 설정되지 않았습니다.`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    return undefined;
  }

  return value;
}

export function getEnv() {
  return {
    GOOGLE_OAUTH_CREDENTIALS_JSON: getRequiredEnv("GOOGLE_OAUTH_CREDENTIALS_JSON"),
    GOOGLE_OAUTH_TOKEN_JSON: getRequiredEnv("GOOGLE_OAUTH_TOKEN_JSON"),
    GEMINI_API_KEY: getRequiredEnv("GEMINI_API_KEY"),
  };
}

export function getBriefingEnv() {
  return {
    ...getEnv(),
    CRON_SECRET: getRequiredEnv("CRON_SECRET"),
    BRIEFING_TO_EMAIL: getRequiredEnv("BRIEFING_TO_EMAIL"),
    BRIEFING_MAX_QUERIES: Number(getOptionalEnv("BRIEFING_MAX_QUERIES") || "5"),
    BRIEFING_MAX_NEWS: Number(getOptionalEnv("BRIEFING_MAX_NEWS") || "5"),
  };
}
