// lib/gmail.ts - 제목 인코딩 포함
// (2026-03-31) 파일 우선이 아니라 환경변수 우선, 없으면 파일 fallback, Gmail HTML 메일 발송 유틸

// File: lib/gmail.ts

import { google } from "googleapis"

type SendMailParams = {
to: string;
subject: string;
html: string;
};

type CreateDraftMailParams = {
to: string;
subject: string;
html: string;
};

function getRequiredEnv(name: string) {
const value = process.env[name];
if (!value || !value.trim()) {
throw new Error(`환경변수 ${name} 가 설정되지 않았습니다.`);
}
return value;
}

function parseJsonEnv<T>(name: string): T {
const raw = getRequiredEnv(name);

try {
return JSON.parse(raw) as T;
} catch {
throw new Error(`환경변수 ${name} JSON 파싱에 실패했습니다.`);
}
}

type GoogleOAuthCredentials = {
installed?: {
client_id: string;
client_secret: string;
redirect_uris: string[];
};
web?: {
client_id: string;
client_secret: string;
redirect_uris: string[];
};
};

type GoogleOAuthToken = {
access_token?: string;
refresh_token?: string;
scope?: string;
token_type?: string;
expiry_date?: number;
};

function createOAuthClient() {
const credentials =
parseJsonEnv<GoogleOAuthCredentials>("GOOGLE_OAUTH_CREDENTIALS_JSON");
const token = parseJsonEnv<GoogleOAuthToken>("GOOGLE_OAUTH_TOKEN_JSON");

const config = credentials.installed || credentials.web;

if (!config) {
throw new Error("GOOGLE_OAUTH_CREDENTIALS_JSON 형식이 올바르지 않습니다.");
}

const oAuth2Client = new google.auth.OAuth2(
config.client_id,
config.client_secret,
config.redirect_uris?.[0]
);

oAuth2Client.setCredentials(token);

return oAuth2Client;
}

function buildRawMessage(params: {
to: string;
subject: string;
html: string;
}) {
const lines = [
`To: ${params.to}`,
"Content-Type: text/html; charset=UTF-8",
"MIME-Version: 1.0",
`Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`,
"",
params.html,
];

return Buffer.from(lines.join("\n"))
.toString("base64")
.replace(/\+/g, "-")
.replace(/\//g, "_")
.replace(/=+$/, "");
}

export async function sendMail(params: SendMailParams) {
const auth = createOAuthClient();
const gmail = google.gmail({ version: "v1", auth });

const raw = buildRawMessage(params);

const response = await gmail.users.messages.send({
userId: "me",
requestBody: {
raw,
},
});

return {
id: response.data.id || null,
threadId: response.data.threadId || null,
};
}

export async function createDraftMail(params: CreateDraftMailParams) {
const auth = createOAuthClient();
const gmail = google.gmail({ version: "v1", auth });

const raw = buildRawMessage(params);

const response = await gmail.users.drafts.create({
userId: "me",
requestBody: {
message: {
raw,
},
},
});

return {
id: response.data.id || null,
messageId: response.data.message?.id || null,
threadId: response.data.message?.threadId || null,
};
}
