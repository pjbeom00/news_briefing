import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { authenticate } from "@google-cloud/local-auth";

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

async function main() {
  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });

  const oauth2Client = auth as any;

  if (!oauth2Client.credentials) {
    throw new Error("OAuth credentials를 가져오지 못했습니다.");
  }

  await fs.writeFile(
    TOKEN_PATH,
    JSON.stringify(oauth2Client.credentials, null, 2)
  );

  console.log("token.json 저장 완료");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
