#!/usr/bin/env node
/*
 * Downloads the Network Growth & Attrition DAX result to JSON.
 */

import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_OUTPUT_FILE = "growth-attrition.json";

const DAX_QUERY = String.raw`// DAX Query
DEFINE
	VAR __DS0FilterTable = 
		FILTER(
			KEEPFILTERS(VALUES('Date'[Date])),
			'Date'[Date] >= DATE(2025, 05, 21)
		)

	VAR __DS0FilterTable2 = 
		FILTER(
			KEEPFILTERS(VALUES('Company'[CompanyID])),
			NOT(ISBLANK('Company'[CompanyID]))
		)

	VAR __ValueFilterDM1 = 
		FILTER(
			KEEPFILTERS(
				SUMMARIZECOLUMNS(
					'Company'[CompanyID],
					'Company'[CompanyName],
					'Company'[Province],
					__DS0FilterTable,
					__DS0FilterTable2,
					"Active_Company_Selected_Date", 'Company'[Active Company Selected Date],
					"Selected_Date_Active_Count", 'LicensedEmployees'[Selected Date Active Count],
					"SOY_Active_Count", 'LicensedEmployees'[SOY Active Count],
					"SOY_Active___Created_After_Offset_Count", 'LicensedEmployees'[SOY Active - Created After Offset Count],
					"SOY_Inactive___Terminated_After_Offset_Count", 'LicensedEmployees'[SOY Inactive - Terminated After Offset Count],
					"Reported_SOY_Count", 'LicensedEmployees'[Reported SOY Count],
					"Active_Location_Count", 'Location'[Active Location Count],
					"CY_New_Hire_Count", 'LicensedEmployees'[CY New Hire Count],
					"SOY_Net___After_Offest", 'LicensedEmployees'[SOY Net - After Offest],
					"CY_New_Hire_Transfer_Count", 'LicensedEmployees'[CY New Hire Transfer Count],
					"CY_New_Hire_Non_Transfer_Count", 'LicensedEmployees'[CY New Hire Non-Transfer Count],
					"CY_Termination_Transfer_Count", 'LicensedEmployees'[CY Termination Transfer Count],
					"CY_Termination_Non_Transfer_Count", 'LicensedEmployees'[CY Termination Non-Transfer Count],
					"CY_Termination_Count", 'LicensedEmployees'[CY Termination Count],
					"CY_Net", 'LicensedEmployees'[CY Net],
					"CY_Hire_Franchising_Count", 'LicensedEmployees'[CY Hire Franchising Count],
					"Reported_YTD_Growth", 'LicensedEmployees'[Reported YTD Growth],
					"Net_Transfers", 'LicensedEmployees'[Net Transfers],
					"Organic_Growth_Finance", 'LicensedEmployees'[Organic Growth Finance],
					"Include_In_Analysis", IGNORE('LicensedEmployees'[Include In Analysis])
				)
			),
			[Include_In_Analysis] > 0
		)

	VAR __DS0Core = 
		SUMMARIZECOLUMNS(
			ROLLUPADDISSUBTOTAL(
				ROLLUPGROUP('Company'[CompanyID], 'Company'[CompanyName], 'Company'[Province]), "IsGrandTotalRowTotal"
			),
			__DS0FilterTable,
			__DS0FilterTable2,
			__ValueFilterDM1,
			"Active_Company_Selected_Date", 'Company'[Active Company Selected Date],
			"Selected_Date_Active_Count", 'LicensedEmployees'[Selected Date Active Count],
			"SOY_Active_Count", 'LicensedEmployees'[SOY Active Count],
			"SOY_Active___Created_After_Offset_Count", 'LicensedEmployees'[SOY Active - Created After Offset Count],
			"SOY_Inactive___Terminated_After_Offset_Count", 'LicensedEmployees'[SOY Inactive - Terminated After Offset Count],
			"Reported_SOY_Count", 'LicensedEmployees'[Reported SOY Count],
			"Active_Location_Count", 'Location'[Active Location Count],
			"CY_New_Hire_Count", 'LicensedEmployees'[CY New Hire Count],
			"SOY_Net___After_Offest", 'LicensedEmployees'[SOY Net - After Offest],
			"CY_New_Hire_Transfer_Count", 'LicensedEmployees'[CY New Hire Transfer Count],
			"CY_New_Hire_Non_Transfer_Count", 'LicensedEmployees'[CY New Hire Non-Transfer Count],
			"CY_Termination_Transfer_Count", 'LicensedEmployees'[CY Termination Transfer Count],
			"CY_Termination_Non_Transfer_Count", 'LicensedEmployees'[CY Termination Non-Transfer Count],
			"CY_Termination_Count", 'LicensedEmployees'[CY Termination Count],
			"CY_Net", 'LicensedEmployees'[CY Net],
			"CY_Hire_Franchising_Count", 'LicensedEmployees'[CY Hire Franchising Count],
			"Reported_YTD_Growth", 'LicensedEmployees'[Reported YTD Growth],
			"Net_Transfers", 'LicensedEmployees'[Net Transfers],
			"Organic_Growth_Finance", 'LicensedEmployees'[Organic Growth Finance]
		)

	VAR __DS0PrimaryWindowed = 
		TOPN(
			502,
			__DS0Core,
			[IsGrandTotalRowTotal],
			0,
			'Company'[CompanyName],
			1,
			'Company'[CompanyID],
			1,
			'Company'[Province],
			1
		)

EVALUATE
	__DS0PrimaryWindowed

ORDER BY
	[IsGrandTotalRowTotal] DESC,
	'Company'[CompanyName],
	'Company'[CompanyID],
	'Company'[Province]`;

function parseArgs(argv) {
  const result = {
    output: DEFAULT_OUTPUT_FILE
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

    throw new Error(`unknown argument "${arg}"`);
  }

  return result;
}

function printHelp() {
  console.log(`Usage:
  node scripts/get-growth-attrition.js
  node scripts/get-growth-attrition.js --output growth-attrition.json

Environment:
  Uses scripts/powerbi-tool.js, which reads POWERBI_* settings from project-root .env.
`);
}

function runPowerBiQuery(daxQuery) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "growth-attrition-dax-"));
  const daxPath = path.join(tempDir, "growth-attrition.dax");
  writeFileSync(daxPath, daxQuery);

  const result = spawnSync("node", ["scripts/powerbi-tool.js", "query", "--file", daxPath], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const response = runPowerBiQuery(DAX_QUERY);
  const rows = extractRows(response);
  writeFileSync(args.output, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, file: args.output, rows: rows.length }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
