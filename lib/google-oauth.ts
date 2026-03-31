// lib/google-oauth.ts

// lib/google-oauth.ts

import { google } from "googleapis";
import { getEnv } from "./env";

type InstalledCredentials = {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
};

type OAuthToken = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

function parseCredentials(): InstalledCredentials {
  const env = getEnv();

  try {
    return JSON.parse(env.GOOGLE_OAUTH_CREDENTIALS_JSON) as InstalledCredentials;
  } catch {
    throw new Error("GOOGLE_OAUTH_CREDENTIALS_JSON 값이 올바른 JSON 형식이 아닙니다.");
  }
}

function parseToken(): OAuthToken {
  const env = getEnv();

  try {
    return JSON.parse(env.GOOGLE_OAUTH_TOKEN_JSON) as OAuthToken;
  } catch {
    throw new Error("GOOGLE_OAUTH_TOKEN_JSON 값이 올바른 JSON 형식이 아닙니다.");
  }
}

export function getGoogleOAuthClient() {
  const credentials = parseCredentials();
  const token = parseToken();

  const installed = credentials.installed;

  if (!installed) {
    throw new Error("credentials JSON 안에 installed 정보가 없습니다.");
  }

  if (!installed.client_id) {
    throw new Error("credentials JSON 안에 client_id가 없습니다.");
  }

  if (!installed.client_secret) {
    throw new Error("credentials JSON 안에 client_secret이 없습니다.");
  }

  if (!installed.redirect_uris || installed.redirect_uris.length === 0) {
    throw new Error("credentials JSON 안에 redirect_uris가 없습니다.");
  }

  const oAuth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    installed.redirect_uris[0]
  );

  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}
