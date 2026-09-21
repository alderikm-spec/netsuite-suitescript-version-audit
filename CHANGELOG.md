# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0 - 2026-09-21

- Initial public release.
- Scan accessible JavaScript files under SuiteScripts, SuiteBundles, and SuiteApps.
- Detect explicit SuiteScript version declarations.
- Detect common SuiteScript 1.0 APIs when no version tag is present.
- Distinguish unversioned SuiteScript 2.x modules from legacy scripts.
- Generate a prioritized CSV report with recommended actions.
- Log summary totals by source area and detected version.
