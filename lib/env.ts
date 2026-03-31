// lib/env.ts

// lib/env.ts

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`환경변수 ${name} 가 설정되지 않았습니다.`);
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
