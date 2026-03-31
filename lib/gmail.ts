// lib/gmail.ts - 제목 인코딩 포함
// (2026-03-31) 파일 우선이 아니라 환경변수 우선, 없으면 파일 fallback, Gmail HTML 메일 발송 유틸

import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");

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

let cachedGmail: ReturnType<typeof google.gmail> | null = null;

async function readJsonFromEnvOrFile(
  envKey: string,
  filePath: string
): Promise<string> {
  const envValue = process.env[envKey];

  if (envValue && envValue.trim()) {
    return envValue;
  }

  return await fs.readFile(filePath, "utf-8");
}

async function getGmailClient() {
  if (cachedGmail) {
    return cachedGmail;
  }

  const credentialsRaw = await readJsonFromEnvOrFile(
    "GOOGLE_OAUTH_CREDENTIALS_JSON",
    CREDENTIALS_PATH
  );

  const tokenRaw = await readJsonFromEnvOrFile(
    "GOOGLE_OAUTH_TOKEN_JSON",
    TOKEN_PATH
  );

  let credentials: InstalledCredentials;
  let token: OAuthToken;

  try {
    credentials = JSON.parse(credentialsRaw) as InstalledCredentials;
  } catch {
    console.error("credentialsRaw:", credentialsRaw);
    throw new Error("GOOGLE_OAUTH_CREDENTIALS_JSON 또는 credentials.json 파싱 실패");
  }

  try {
    token = JSON.parse(tokenRaw) as OAuthToken;
  } catch {
    console.error("tokenRaw:", tokenRaw);
    throw new Error("GOOGLE_OAUTH_TOKEN_JSON 또는 token.json 파싱 실패");
  }

  const installed = credentials.installed;

  if (!installed) {
    throw new Error("OAuth credentials 형식이 올바르지 않습니다. installed 필드가 필요합니다.");
  }

  if (!installed.client_id) {
    throw new Error("OAuth credentials에 client_id가 없습니다.");
  }

  if (!installed.client_secret) {
    throw new Error("OAuth credentials에 client_secret이 없습니다.");
  }

  if (!installed.redirect_uris || installed.redirect_uris.length === 0) {
    throw new Error("OAuth credentials에 redirect_uris가 없습니다.");
  }

  const oAuth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    installed.redirect_uris[0]
  );

  oAuth2Client.setCredentials(token);

  cachedGmail = google.gmail({
    version: "v1",
    auth: oAuth2Client,
  });

  return cachedGmail;
}

function encodeMessage(message: string) {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

export async function sendMail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const gmail = await getGmailClient();

  const encodedSubject = encodeSubject(params.subject);

  const rawMessage = [
    `To: ${params.to}`,
    "MIME-Version: 1.0",
    `Subject: ${encodedSubject}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    params.html,
  ].join("\r\n");

  const encodedMessage = encodeMessage(rawMessage);

  try {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error("GMAIL SEND ERROR:", {
      message: error?.message,
      code: error?.code,
      errors: error?.errors,
      response: error?.response?.data,
    });

    throw error;
  }
}
