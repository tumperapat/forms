import { google } from "googleapis";
import { prisma } from "../prisma";
import type { FormResponse, FormResponseValue } from "@prisma/client";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // ensures a refresh_token is returned even on repeat connects
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForRefreshToken(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token — revoke prior access at myaccount.google.com/permissions and reconnect");
  }
  return tokens.refresh_token;
}

function clientForRefreshToken(refreshToken: string) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.sheets({ version: "v4", auth: client });
}

async function fieldLabelsAndRow(formId: number, values: FormResponseValue[], extra: { submittedAt: Date; submittedByName: string }) {
  const fields = await prisma.formField.findMany({
    where: { formId, type: { not: "SECTION" } },
    orderBy: { id: "asc" },
  });
  const byField = new Map(values.map((v) => [v.fieldId, v.value]));
  return {
    headers: ["Submitted at", "Submitted by", ...fields.map((f) => f.label)],
    row: [extra.submittedAt.toISOString(), extra.submittedByName, ...fields.map((f) => byField.get(f.id) ?? "")],
  };
}

// Creates the spreadsheet the first time a form connects, writing the current header row.
export async function createSpreadsheetForForm(refreshToken: string, formId: number, title: string, sheetName: string) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const sheets = google.sheets({ version: "v4", auth: client });

  const created = await sheets.spreadsheets.create({
    requestBody: { properties: { title }, sheets: [{ properties: { title: sheetName } }] },
  });
  const spreadsheetId = created.data.spreadsheetId!;

  const fields = await prisma.formField.findMany({ where: { formId, type: { not: "SECTION" } }, orderBy: { id: "asc" } });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Submitted at", "Submitted by", ...fields.map((f) => f.label)]] },
  });

  return spreadsheetId;
}

// Best-effort: called after every submission. Never throws into the request path — callers should catch.
export async function appendResponseRow(formId: number, response: FormResponse & { values: FormResponseValue[]; submittedBy: { name: string } | null }) {
  const connection = await prisma.sheetConnection.findUnique({ where: { formId } });
  if (!connection?.refreshToken || !connection.spreadsheetId || !connection.syncOnSubmit) return;

  const { row } = await fieldLabelsAndRow(formId, response.values, {
    submittedAt: response.submittedAt,
    submittedByName: response.submittedBy?.name ?? "—",
  });
  const sheets = clientForRefreshToken(connection.refreshToken);
  await sheets.spreadsheets.values.append({
    spreadsheetId: connection.spreadsheetId,
    range: `${connection.sheetName}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

// Manual "sync now": overwrites the whole sheet with the current header + every response,
// for recovering from drift (e.g. fields renamed after some responses were already synced).
export async function resyncWholeSheet(formId: number) {
  const connection = await prisma.sheetConnection.findUnique({ where: { formId } });
  if (!connection?.refreshToken || !connection.spreadsheetId) {
    throw new Error("This form has no connected Google Sheet");
  }

  const responses = await prisma.formResponse.findMany({
    where: { formId },
    include: { values: true, submittedBy: { select: { name: true } } },
    orderBy: { submittedAt: "asc" },
  });

  const fields = await prisma.formField.findMany({ where: { formId, type: { not: "SECTION" } }, orderBy: { id: "asc" } });
  const headers = ["Submitted at", "Submitted by", ...fields.map((f) => f.label)];
  const rows = responses.map((r) => {
    const byField = new Map(r.values.map((v) => [v.fieldId, v.value]));
    return [r.submittedAt.toISOString(), r.submittedBy?.name ?? "—", ...fields.map((f) => byField.get(f.id) ?? "")];
  });

  const sheets = clientForRefreshToken(connection.refreshToken);
  await sheets.spreadsheets.values.clear({ spreadsheetId: connection.spreadsheetId, range: connection.sheetName });
  await sheets.spreadsheets.values.update({
    spreadsheetId: connection.spreadsheetId,
    range: `${connection.sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers, ...rows] },
  });
}
