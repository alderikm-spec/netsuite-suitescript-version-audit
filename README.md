# NetSuite SuiteScript Version Audit

A SuiteScript 2.1 Map/Reduce utility that inventories accessible JavaScript files in the NetSuite File Cabinet and reports the SuiteScript version each file declares or appears to use.

NetSuite has announced that scripts using SuiteScript 1.0, 2.0, or 2.x must be updated to SuiteScript 2.1 before NetSuite 2028.2. This utility provides a practical starting point for identifying affected files and separating custom scripts from installed SuiteApp and SuiteBundle content.

## What it scans

The script scans JavaScript files under:

- `/SuiteScripts`
- `/SuiteBundles`
- `/SuiteApps`

For each accessible file, it reports:

- File internal ID
- File name and folder
- Source area
- Detected SuiteScript version
- Script type
- Recommended action
- Detection method
- File size
- Notes

## Version detection

The audit recognizes:

- Explicit `@NApiVersion 2.1`, `2.0`, `2.x`, and `1.0` declarations
- SuiteScript 1.0 files by common `nlapi*` and `nlobj*` APIs when no version tag exists
- SuiteScript 2.x custom modules that use `define()` or `require()` but omit `@NApiVersion`
- Files with no recognizable SuiteScript markers
- Files that appear in search results but cannot be read

The generated report places remediation items before compliant 2.1 files.

## Repository contents

- [`src/SuiteScriptVersionAudit_MR.js`](src/SuiteScriptVersionAudit_MR.js) — Map/Reduce script
- [`docs/deployment-instructions.md`](docs/deployment-instructions.md) — setup and deployment guide
- [`examples/sample-output.csv`](examples/sample-output.csv) — representative report output
- [`CHANGELOG.md`](CHANGELOG.md) — release history

## Quick start

1. Upload `src/SuiteScriptVersionAudit_MR.js` to the NetSuite File Cabinet.
2. Create a Map/Reduce script record.
3. Add the Integer Number parameter `custscript_ssva_output_folder`.
4. Enter the internal ID of the File Cabinet folder where reports should be saved.
5. Run the deployment, preferably with an Administrator role for the first audit.

See the [deployment instructions](docs/deployment-instructions.md) for the complete procedure and recommended names and IDs.

## Important limitations

- Publishers can protect or hide files installed by SuiteApps and SuiteBundles. A protected file may be unreadable or may not appear in the file search at all.
- An unreadable or absent vendor file cannot be conclusively classified by this utility. Confirm upgrade plans with the publisher.
- A custom module may legally omit `@NApiVersion`. Such a file is reported as `Unspecified` and should be reviewed in the context of the scripts that load it.
- Legacy API detection is heuristic. Review results before treating them as a definitive conversion list.
- Do not edit managed SuiteApp or third-party SuiteBundle files directly. Contact the publisher for an updated version.
- The script creates an in-memory result list during the summarize stage. This is appropriate for typical File Cabinets, but unusually large accounts may require a paged or multi-file reporting approach.

## Suggested workflow

After generating the CSV:

1. Add an `Owner` or `Vendor` column.
2. Assign every non-2.1 result to the internal team or the applicable publisher.
3. Review `Unknown`, `Unspecified`, and `Unreadable` results manually.
4. Convert and test custom scripts in a sandbox.
5. Ask vendors for their SuiteScript 2.1 compatibility timeline.

## License

Released under the [MIT License](LICENSE).

## Disclaimer

This is an independent community utility and is not affiliated with or endorsed by Oracle or NetSuite. Use it at your own risk and test it in a sandbox before production use.
