// lib/gmail.ts - 제목 인코딩 포함
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

async function getGmailClient() {
  const credentialsRaw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const tokenRaw = await fs.readFile(TOKEN_PATH, "utf-8");

  const credentials = JSON.parse(credentialsRaw) as InstalledCredentials;
  const token = JSON.parse(tokenRaw);

  const installed = credentials.installed;
  if (!installed) {
    throw new Error("credentials.json 형식이 올바르지 않습니다.");
  }

  const oAuth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    installed.redirect_uris[0]
  );

  oAuth2Client.setCredentials(token);

  return google.gmail({ version: "v1", auth: oAuth2Client });
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

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return response.data;
}