#!/usr/bin/env node
/*
 * Downloads the mobile log table rows to CSV or JSON.
 */

import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_OUTPUT_FORMAT = "csv";
const POWERBI_WORKSPACE_ID = "2b086d05-1b3c-4092-952d-8c38cf006bdd";
const POWERBI_DATASET_ID = "f01b27ef-1c52-4f95-983a-1e096c9801d7";

const DAX_QUERY = String.raw`EVALUATE
	'logs'`;

function parseArgs(argv) {
  const result = {
    format: undefined,
    output: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      const value = argv[++index];
      if (!value) {
        throw new Error("--output requires a file path");
      }
      result.output = value;
      continue;
    }

    if (arg === "--format") {
      const value = argv[++index];
      if (!value) {
        throw new Error("--format requires csv or json");
      }
      result.format = normalizeFormat(value);
      continue;
    }

    throw new Error(`unknown argument "${arg}"`);
  }

  result.format ??= inferFormatFromOutput(result.output) ?? DEFAULT_OUTPUT_FORMAT;
  result.output ??= `mobile-logs.${result.format}`;

  return result;
}

function normalizeFormat(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized !== "csv" && normalized !== "json") {
    throw new Error("--format must be csv or json");
  }
  return normalized;
}

function inferFormatFromOutput(outputPath) {
  if (!outputPath) {
    return null;
  }

  const extension = path.extname(outputPath).toLowerCase();
  if (extension === ".csv") {
    return "csv";
  }
  if (extension === ".json") {
    return "json";
  }
  return null;
}

function printHelp() {
  console.log(`Usage:
  node scripts/power-bi/get-mobile-logs.mjs
  node scripts/power-bi/get-mobile-logs.mjs --format csv --output mobile-logs.csv
  node scripts/power-bi/get-mobile-logs.mjs --format json --output mobile-logs.json

Options:
  --format <csv|json>  Output format. Defaults to csv.
  --output, -o <path>  Output path. Defaults to mobile-logs.csv or mobile-logs.json.

Environment:
  Uses scripts/power-bi/powerbi-tool.mjs for authentication. Workspace and dataset IDs are set in this script.
`);
}

function runPowerBiQuery(daxQuery) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "mobile-logs-dax-"));
  const daxPath = path.join(tempDir, "mobile-logs.dax");
  writeFileSync(daxPath, daxQuery);

  const result = spawnSync(
    "node",
    [
      "scripts/power-bi/powerbi-tool.mjs",
      "query",
      "--workspace-id",
      POWERBI_WORKSPACE_ID,
      "--dataset-id",
      POWERBI_DATASET_ID,
      "--file",
      daxPath
    ],
    {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const message = result.stderr || result.stdout || `Power BI query exited with code ${result.status}`;
    throw new Error(message.trim());
  }

  return JSON.parse(result.stdout);
}

function extractRows(response) {
  if (!response.ok) {
    throw new Error(`Power BI query failed: ${response.status} ${response.statusText}`);
  }

  const rows = response.body?.results?.[0]?.tables?.[0]?.rows;
  if (!Array.isArray(rows)) {
    throw new Error("Power BI response did not contain a rows array");
  }

  return rows;
}

function collectColumns(rows) {
  const columns = [];
  const seen = new Set();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    }
  }

  return columns;
}

function csvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll("\"", "\"\"")}"`;
}

function rowsToCsv(rows) {
  const columns = collectColumns(rows);
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ];
  return `${lines.join("\n")}\n`;
}

function serializeRows(rows, format) {
  if (format === "json") {
    return `${JSON.stringify(rows, null, 2)}\n`;
  }

  if (format === "csv") {
    return rowsToCsv(rows);
  }

  throw new Error(`unsupported output format "${format}"`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const response = runPowerBiQuery(DAX_QUERY);
  const rows = extractRows(response);
  writeFileSync(args.output, serializeRows(rows, args.format));
  console.log(JSON.stringify({ ok: true, file: args.output, format: args.format, rows: rows.length }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
