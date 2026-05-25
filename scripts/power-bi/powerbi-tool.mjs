#!/usr/bin/env node
/*
 * Power BI read helper.
 * Lists datasets, inspects dataset metadata/tables, and runs read-only DAX queries.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_POWERBI_BASE_URL = "https://api.powerbi.com/v1.0/myorg";
const POWERBI_SCOPE = "https://analysis.windows.net/powerbi/api/.default";
const REJECTED_REQUEST_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key"
]);
const REDACTED_RESPONSE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "set-cookie2"
]);
const VALUE_FLAGS = new Set([
  "dataset-id",
  "workspace-id",
  "query",
  "file",
  "header"
]);

function stripOptionalQuotes(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote !== "\"" && quote !== "'") || trimmed.at(-1) !== quote) {
    return trimmed;
  }

  const inner = trimmed.slice(1, -1);
  return quote === "\"" ? inner.replace(/\\n/g, "\n").replace(/\\"/g, "\"") : inner;
}

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
  const separatorIndex = normalized.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = normalized.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  return [key, stripOptionalQuotes(normalized.slice(separatorIndex + 1))];
}

function findProjectRoot(startDir = SCRIPT_DIR) {
  for (let dir = path.resolve(startDir); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "AGENTS.md")) && existsSync(path.join(dir, "scripts"))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(process.cwd());
    }
  }
}

function loadProjectEnv() {
  const envPath = path.join(findProjectRoot(), ".env");
  if (!existsSync(envPath)) {
    return null;
  }

  const rawEnv = readFileSync(envPath, "utf8");
  for (const line of rawEnv.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return envPath;
}

function parseArgs(argv) {
  const result = {
    positional: [],
    headers: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      result.positional.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.trim();
    if (!VALUE_FLAGS.has(key)) {
      throw new Error(`unknown option --${key}`);
    }

    const value = inlineValue ?? argv[++index];
    if (typeof value !== "string") {
      throw new Error(`missing value for --${key}`);
    }

    if (key === "header") {
      addHeader(result.headers, value);
      continue;
    }

    result[toCamelCase(key)] = value;
  }

  return result;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function addHeader(headers, rawHeader) {
  const separatorIndex = rawHeader.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error("--header must use Name=Value");
  }

  const name = rawHeader.slice(0, separatorIndex).trim();
  const value = rawHeader.slice(separatorIndex + 1).trim();
  if (!name || !value) {
    throw new Error("--header must include a non-empty name and value");
  }

  if (REJECTED_REQUEST_HEADER_NAMES.has(name.toLowerCase())) {
    throw new Error(`${name} is owned by the helper environment and must not be set with --header`);
  }

  headers[name] = value;
}

function trimOptionalString(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requiredString(value, name) {
  const trimmed = trimOptionalString(value);
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function normalizeBaseUrl(rawBaseUrl) {
  let baseUrl;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error("POWERBI_BASE_URL must be a valid absolute URL");
  }

  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new Error("POWERBI_BASE_URL must use https or http");
  }

  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }

  return baseUrl;
}

function resolveConfig(options = {}, envSource = process.env, { requireAuth = true } = {}) {
  const workspaceId = trimOptionalString(options.workspaceId) ?? trimOptionalString(envSource.POWERBI_WORKSPACE_ID);
  const datasetId = trimOptionalString(options.datasetId) ?? trimOptionalString(envSource.POWERBI_DATASET_ID);
  const accessToken = trimOptionalString(envSource.POWERBI_ACCESS_TOKEN);
  const clientCredentials = {
    tenantId: trimOptionalString(envSource.POWERBI_TENANT_ID),
    clientId: trimOptionalString(envSource.POWERBI_CLIENT_ID),
    clientSecret: trimOptionalString(envSource.POWERBI_CLIENT_SECRET)
  };

  if (requireAuth && !accessToken && (!clientCredentials.tenantId || !clientCredentials.clientId || !clientCredentials.clientSecret)) {
    throw new Error(
      "Power BI auth is required: set POWERBI_ACCESS_TOKEN, or set POWERBI_TENANT_ID, POWERBI_CLIENT_ID, and POWERBI_CLIENT_SECRET"
    );
  }

  return {
    baseUrl: normalizeBaseUrl(trimOptionalString(envSource.POWERBI_BASE_URL) ?? DEFAULT_POWERBI_BASE_URL),
    workspaceId,
    datasetId,
    accessToken,
    clientCredentials
  };
}

function readTextFile(filePath) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  try {
    return readFileSync(resolvedPath, "utf8");
  } catch (error) {
    throw new Error(`failed to read ${resolvedPath}: ${error.message}`);
  }
}

async function readStdin() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadQuery(options) {
  if (options.query) {
    return options.query;
  }

  if (options.file) {
    return readTextFile(options.file);
  }

  const stdin = await readStdin();
  if (stdin.trim()) {
    return stdin;
  }

  throw new Error("DAX query is required through --query, --file, or stdin");
}

function buildPath(config, pathParts) {
  const sanitizedParts = pathParts.map((part) => encodeURIComponent(requiredString(part, "path segment")));
  if (config.workspaceId) {
    return ["groups", encodeURIComponent(config.workspaceId), ...sanitizedParts].join("/");
  }

  return sanitizedParts.join("/");
}

function resolveRequestUrl(config, relativePath) {
  const resolvedUrl = new URL(relativePath.replace(/^\/+/, ""), config.baseUrl);

  if (resolvedUrl.origin !== config.baseUrl.origin || !resolvedUrl.pathname.startsWith(config.baseUrl.pathname)) {
    throw new Error("Power BI request path must stay within POWERBI_BASE_URL");
  }

  return resolvedUrl;
}

function buildPayload(command, config, options) {
  const datasetId = config.datasetId ?? trimOptionalString(options.datasetId);

  if (command === "workspaces") {
    return {
      method: "GET",
      path: "groups"
    };
  }

  if (command === "datasets") {
    return {
      method: "GET",
      path: buildPath(config, ["datasets"])
    };
  }

  if (command === "dataset") {
    return {
      method: "GET",
      path: buildPath(config, ["datasets", requiredString(datasetId, "--dataset-id or POWERBI_DATASET_ID")])
    };
  }

  if (command === "tables") {
    requiredString(datasetId, "--dataset-id or POWERBI_DATASET_ID");
    throw new Error(
      "the Power BI REST tables endpoint only supports push datasets; for normal semantic models, use query with known table names or inspect schema through XMLA/admin metadata"
    );
  }

  throw new Error(`unknown read command "${command}"`);
}

function buildQueryPayload(config, options, query) {
  const datasetId = config.datasetId ?? trimOptionalString(options.datasetId);

  return {
    method: "POST",
    path: buildPath(config, ["datasets", requiredString(datasetId, "--dataset-id or POWERBI_DATASET_ID"), "executeQueries"]),
    body: {
      queries: [{ query }],
      serializerSettings: {
        includeNulls: true
      }
    }
  };
}

function buildSchemaPayload(config, options) {
  return buildQueryPayload(
    config,
    options,
    "SELECT [ID], [Name], [Description], [IsHidden], [TableStorageID] FROM $SYSTEM.TMSCHEMA_TABLES"
  );
}

function buildRequestHeaders(accessToken, rawHeaders = {}) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(rawHeaders)) {
    const headerName = key.trim();
    if (headerName && typeof value === "string" && !REJECTED_REQUEST_HEADER_NAMES.has(headerName.toLowerCase())) {
      headers.set(headerName, value);
    }
  }

  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json, text/plain;q=0.9, */*;q=0.8");
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function sanitizeResponseHeaders(headers) {
  const sanitizedHeaders = {};

  for (const [key, value] of headers.entries()) {
    if (!REDACTED_RESPONSE_HEADER_NAMES.has(key.toLowerCase())) {
      sanitizedHeaders[key] = value;
    }
  }

  return sanitizedHeaders;
}

function parseResponseBody(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

async function getAccessToken(config) {
  if (config.accessToken) {
    return config.accessToken;
  }

  const { tenantId, clientId, clientSecret } = config.clientCredentials;
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: POWERBI_SCOPE
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: form
  });
  const rawBody = await response.text();
  const body = parseResponseBody(rawBody);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      url: tokenUrl,
      headers: sanitizeResponseHeaders(response.headers),
      body
    };
  }

  if (!body?.access_token) {
    throw new Error("token response did not include access_token");
  }

  return body.access_token;
}

async function executePayload(payload, config, rawHeaders = {}) {
  const token = await getAccessToken(config);
  if (token && typeof token === "object" && token.ok === false) {
    return token;
  }

  const url = resolveRequestUrl(config, payload.path);
  const init = {
    method: payload.method,
    headers: buildRequestHeaders(token, rawHeaders)
  };

  if (payload.body) {
    init.body = JSON.stringify(payload.body);
  }

  const response = await fetch(url, init);
  const rawBody = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: url.toString(),
    headers: sanitizeResponseHeaders(response.headers),
    body: parseResponseBody(rawBody)
  };
}

function printList() {
  console.log(`workspaces\tList workspaces visible to the Power BI identity.
datasets\tList datasets in the configured workspace.
dataset\t\tInspect one dataset by ID.
tables\t\tList tables and columns for one dataset.
schema\t\tAttempt semantic model table discovery through executeQueries.
query\t\tRun a read-only DAX query through executeQueries.
payload\t\tPrint the validated read request payload without calling Power BI.`);
}

function printHelp() {
  console.log(`Usage:
  node scripts/power-bi/powerbi-tool.mjs list
  node scripts/power-bi/powerbi-tool.mjs workspaces
  node scripts/power-bi/powerbi-tool.mjs datasets [--workspace-id <id>]
  node scripts/power-bi/powerbi-tool.mjs dataset --dataset-id <id> [--workspace-id <id>]
  node scripts/power-bi/powerbi-tool.mjs tables --dataset-id <id> [--workspace-id <id>]
  node scripts/power-bi/powerbi-tool.mjs schema --dataset-id <id> [--workspace-id <id>]
  node scripts/power-bi/powerbi-tool.mjs query --dataset-id <id> --query "EVALUATE ..."
  node scripts/power-bi/powerbi-tool.mjs query --dataset-id <id> --file query.dax
  node scripts/power-bi/powerbi-tool.mjs payload <workspaces|datasets|dataset|tables|schema|query> [options]

Commands:
  list       Show commands.
  payload    Print the request payload for a read command.
  workspaces List Power BI workspaces visible to this identity.
  datasets   List Power BI datasets.
  dataset    Load one Power BI dataset by ID.
  tables     Push-dataset tables endpoint. Normal semantic models are not supported by this REST endpoint.
  schema     Attempts table discovery through executeQueries. Power BI may reject INFO/DMV metadata queries.
  query      Run a DAX query. This uses POST because the Power BI API does, but it does not create or modify data.

Options:
  --dataset-id <id>     Power BI dataset ID.
  --workspace-id <id>   Power BI workspace/group ID. Defaults to POWERBI_WORKSPACE_ID.
  --query <dax>         DAX query for the query command.
  --file <path>         File containing a DAX query.
  --header Name=Value   Optional non-auth request header. Repeatable.

Environment:
  POWERBI_ACCESS_TOKEN can be used directly.
  Or set POWERBI_TENANT_ID, POWERBI_CLIENT_ID, and POWERBI_CLIENT_SECRET for client-credentials auth.
  Optional: POWERBI_WORKSPACE_ID, POWERBI_DATASET_ID, POWERBI_BASE_URL.
`);
}

async function main() {
  loadProjectEnv();

  const parsed = parseArgs(process.argv.slice(2));
  const [command, payloadCommand] = parsed.positional;

  if (parsed.help || !command || command === "help") {
    printHelp();
    return;
  }

  if (command === "list") {
    if (parsed.positional.length > 1) {
      throw new Error(`unexpected positional argument "${parsed.positional[1]}"`);
    }

    printList();
    return;
  }

  if (command === "payload") {
    if (!payloadCommand) {
      throw new Error("payload requires datasets, dataset, tables, or query");
    }

    const config = resolveConfig(parsed, process.env, { requireAuth: false });
    const payload = payloadCommand === "query"
      ? buildQueryPayload(config, parsed, await loadQuery(parsed))
      : payloadCommand === "schema"
        ? buildSchemaPayload(config, parsed)
        : buildPayload(payloadCommand, config, parsed);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (parsed.positional.length > 1) {
    throw new Error(`unexpected positional argument "${parsed.positional[1]}"`);
  }

  const config = resolveConfig(parsed);
  const payload = command === "query"
    ? buildQueryPayload(config, parsed, await loadQuery(parsed))
    : command === "schema"
      ? buildSchemaPayload(config, parsed)
    : buildPayload(command, config, parsed);
  const result = await executePayload(payload, config, parsed.headers);
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
