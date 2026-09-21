# Deployment Instructions

## Recommended names and IDs

| Object | Recommended value |
|---|---|
| File | `SuiteScriptVersionAudit_MR.js` |
| Script name | `SuiteScript Version Audit` |
| Script ID | `customscript_ss_version_audit` |
| Deployment ID | `customdeploy_ss_version_audit` |
| Parameter label | `Output Folder Internal ID` |
| Parameter ID | `custscript_ssva_output_folder` |
| Parameter type | `Integer Number` |

NetSuite may ask for only the custom ID suffix in some forms. If so, enter `ss_version_audit`, `ss_version_audit`, or `ssva_output_folder` as applicable; NetSuite adds the `customscript_`, `customdeploy_`, or `custscript_` prefix.

## 1. Create an output folder

1. Go to **Documents > Files > File Cabinet**.
2. Create a folder for the reports, for example:
   `/SuiteScripts/SuiteScript Version Audit/Output`
3. Note the folder's internal ID. If internal IDs are not visible, enable **Show Internal IDs** under **Home > Set Preferences > General**, or open the folder record and inspect the `id` value in the URL.

## 2. Upload the script file

1. Download [`SuiteScriptVersionAudit_MR.js`](../src/SuiteScriptVersionAudit_MR.js).
2. In NetSuite, go to **Documents > Files > File Cabinet**.
3. Open a suitable folder under `/SuiteScripts`.
4. Upload the JavaScript file.

## 3. Create the Map/Reduce script record

1. Go to **Customization > Scripting > Scripts > New**.
2. Select the uploaded `SuiteScriptVersionAudit_MR.js` file.
3. Enter:
   - **Name:** `SuiteScript Version Audit`
   - **ID:** `customscript_ss_version_audit`
4. Confirm that NetSuite recognizes the file as a **Map/Reduce Script**.
5. Save the script record.

## 4. Add the output-folder parameter

Add a script parameter with these values:

| Field | Value |
|---|---|
| Label | `Output Folder Internal ID` |
| ID | `custscript_ssva_output_folder` |
| Type | `Integer Number` |
| Description | `Internal ID of the File Cabinet folder where the audit CSV will be saved.` |

The parameter ID must match the constant in the script exactly.

## 5. Create the deployment

Create a deployment with:

| Field | Recommended value |
|---|---|
| Title | `SuiteScript Version Audit` |
| ID | `customdeploy_ss_version_audit` |
| Status | `Not Scheduled` for on-demand execution |
| Log Level | `Audit` |
| Execute As Role | `Administrator` for the initial inventory |

On the deployment's **Parameters** tab, enter the output folder's numeric internal ID in **Output Folder Internal ID**.

Restrict the deployment audience to appropriate administrators. Running as Administrator improves visibility, but publisher-protected content can remain unavailable even to Administrator.

## 6. Test and run

1. Test in a sandbox first when possible.
2. Open the deployment and choose **Save and Execute**, or submit it from the script deployment page.
3. Monitor progress under **Customization > Scripting > Map/Reduce Script Status**.
4. When the execution completes, open the configured output folder.
5. Download the file named similar to:
   `SuiteScript_Version_Audit_20260921_174500Z.csv`

The script also writes an Audit-level completion log containing totals by source area and detected version.

## Understanding the actions

| Action | Meaning |
|---|---|
| `OK` | Explicitly declares SuiteScript 2.1. |
| `UPDATE TO 2.1` | Custom script declares 2.0 or 2.x. |
| `CONVERT TO 2.1` | Custom script appears to use SuiteScript 1.0. |
| `CONTACT VENDOR` | Noncompliant file is installed under SuiteApps or SuiteBundles. |
| `REVIEW MODULE` | A 2.x module has no explicit version declaration. |
| `VERIFY WITH VENDOR` | Installed content could not be read or classified. |
| `REVIEW` | Version or purpose could not be determined automatically. |

## Troubleshooting

### The script says the output-folder parameter is missing

Enter the numeric File Cabinet folder internal ID on the deployment record. Do not enter the folder name or path.

### Some SuiteApp or SuiteBundle scripts are missing

The publisher may have protected the source or excluded it from account-level File Cabinet searches. This is a platform limitation; contact the publisher to confirm SuiteScript 2.1 support.

### A file is reported as Unspecified

Custom SuiteScript modules can omit `@NApiVersion`. Review the file together with the entry-point scripts that load it. Do not assume that `Unspecified` means SuiteScript 1.0.

### Permission errors appear in the execution log

Confirm the deployment's **Execute As Role**, File Cabinet permissions, and output-folder permissions. Some managed content remains intentionally inaccessible regardless of role.
