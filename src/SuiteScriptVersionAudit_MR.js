/**
 * SuiteScript Version Audit
 *
 * Inventories accessible JavaScript files under SuiteScripts, SuiteBundles,
 * and SuiteApps, then creates a CSV containing the detected SuiteScript
 * version and a recommended action.
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */

define([
    'N/file',
    'N/search',
    'N/runtime',
    'N/log'
], (
    file,
    search,
    runtime,
    log
) => {

    const PARAM_OUTPUT_FOLDER = 'custscript_ssva_output_folder';

    const ROOT_SUITE_SCRIPTS = 'SuiteScripts';
    const ROOT_SUITE_BUNDLES = 'SuiteBundles';
    const ROOT_SUITE_APPS = 'SuiteApps';

    const READ_CHUNK_SIZE = 131072; // 128 KB
    const REGEX_OVERLAP = 512;

    // Cache folder hierarchies within each Map/Reduce processor.
    const folderPathCache = {};

    /**
     * Return all JavaScript files that are visible to the executing role.
     * Files outside the three requested root folders are discarded in map().
     */
    const getInputData = () => {

        log.audit({
            title: 'SuiteScript Version Audit',
            details: 'Beginning JavaScript file inventory.'
        });

        return search.create({
            type: search.Type.FILE,
            filters: [
                ['filetype', 'anyof', 'JAVASCRIPT']
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'name' }),
                search.createColumn({ name: 'folder' }),
                search.createColumn({ name: 'documentsize' })
            ]
        });
    };

    /**
     * Inspect one JavaScript file and emit a normalized audit row.
     */
    const map = context => {

        const searchResult = JSON.parse(context.value);
        const values = searchResult.values || {};

        const fileId =
            searchResult.id ||
            getSearchValue(values.internalid);

        const searchFileName =
            getSearchValue(values.name) || '';

        const searchFolderId =
            getSearchValue(values.folder);

        const searchFolderText =
            getSearchText(values.folder);

        let scriptFile = null;
        let fileName = searchFileName;
        let filePath = '';
        let folderPath = '';
        let fileSize =
            getSearchValue(values.documentsize) || '';
        let readable = true;
        let readError = '';

        try {

            scriptFile = file.load({ id: fileId });

            fileName = scriptFile.name || searchFileName;
            fileSize = scriptFile.size || fileSize;

            filePath = normalizePath(scriptFile.path || '');
            folderPath = getFolderFromFilePath(filePath);

        } catch (e) {

            readable = false;
            readError = formatError(e);

            // Metadata may remain searchable even when file.load() is denied.
            folderPath =
                getFolderPath(searchFolderId) ||
                normalizeFolderText(searchFolderText);
        }

        const sourceArea = classifySourceArea(folderPath);

        if (!sourceArea) {
            return;
        }

        let scanResult;

        if (readable && scriptFile) {

            try {
                scanResult = scanScriptFile(scriptFile);
            } catch (e) {

                readable = false;
                readError = formatError(e);

                scanResult = {
                    version: 'Unreadable',
                    detectionMethod: 'Source read failed',
                    scriptType: 'Unknown'
                };
            }

        } else {

            scanResult = {
                version: 'Unreadable',
                detectionMethod: 'File access denied',
                scriptType: 'Unknown'
            };
        }

        const action = determineAction(
            scanResult.version,
            sourceArea
        );

        const notes = buildNotes({
            sourceArea,
            version: scanResult.version,
            scriptType: scanResult.scriptType,
            readable,
            readError
        });

        context.write({
            key: String(fileId),
            value: JSON.stringify({
                fileId: String(fileId || ''),
                fileName,
                folder: folderPath,
                source: sourceArea,
                version: scanResult.version,
                scriptType: scanResult.scriptType,
                action,
                detectionMethod: scanResult.detectionMethod,
                fileSize,
                notes
            })
        });
    };

    /**
     * Preserve one row per file for summarize().
     */
    const reduce = context => {

        if (!context.values || !context.values.length) {
            return;
        }

        context.write({
            key: context.key,
            value: context.values[0]
        });
    };

    /**
     * Sort the results, write the CSV, and log totals.
     */
    const summarize = summary => {

        logInputError(summary);
        logStageErrors('MAP', summary.mapSummary);
        logStageErrors('REDUCE', summary.reduceSummary);

        const outputFolderId =
            runtime.getCurrentScript().getParameter({
                name: PARAM_OUTPUT_FOLDER
            });

        if (!outputFolderId) {
            throw new Error(
                'Output Folder Internal ID is required. ' +
                `Set deployment parameter ${PARAM_OUTPUT_FOLDER}.`
            );
        }

        const rows = [];

        summary.output.iterator().each((key, value) => {

            try {
                rows.push(JSON.parse(value));
            } catch (e) {
                log.error({
                    title: 'Unable to parse audit result',
                    details: {
                        key,
                        value,
                        error: formatError(e)
                    }
                });
            }

            return true;
        });

        rows.sort(compareAuditRows);

        const header = [
            'File Internal ID',
            'Script File',
            'Folder',
            'Source',
            'Version',
            'Script Type',
            'Action',
            'Detection Method',
            'File Size (Bytes)',
            'Notes'
        ];

        const outputFileName =
            'SuiteScript_Version_Audit_' +
            createTimestamp() +
            '.csv';

        const csvFile = file.create({
            name: outputFileName,
            fileType: file.Type.CSV,
            contents: header.map(csvEscape).join(',') + '\n',
            encoding: file.Encoding.UTF8,
            folder: Number(outputFolderId)
        });

        const totals = {
            total: 0,
            suiteScripts: 0,
            suiteBundles: 0,
            suiteApps: 0,
            version21: 0,
            version20: 0,
            version2x: 0,
            version10: 0,
            unspecified: 0,
            unknown: 0,
            unreadable: 0
        };

        rows.forEach(row => {

            csvFile.appendLine({
                value: [
                    row.fileId,
                    row.fileName,
                    row.folder,
                    row.source,
                    row.version,
                    row.scriptType,
                    row.action,
                    row.detectionMethod,
                    row.fileSize,
                    row.notes
                ].map(csvEscape).join(',')
            });

            updateTotals(totals, row);
        });

        const reportFileId = csvFile.save();

        log.audit({
            title: 'SuiteScript Version Audit Complete',
            details: {
                reportFileId,
                reportFileName: outputFileName,
                outputFolderId,
                totals,
                usage: summary.usage,
                concurrency: summary.concurrency,
                yields: summary.yields
            }
        });
    };

    /**
     * Stream the complete source file while retaining only a small overlap.
     */
    const scanScriptFile = scriptFile => {

        const reader = scriptFile.getReader();

        let carry = '';
        let declaredVersion = '';
        let scriptType = '';
        let legacyApiDetected = false;
        let amdModuleDetected = false;

        while (true) {

            const chunk = reader.readChars({
                number: READ_CHUNK_SIZE
            });

            if (chunk === null || chunk === '') {
                break;
            }

            const source = carry + chunk;

            if (!declaredVersion) {

                const versionMatch = source.match(
                    /@NApiVersion\s+([0-9]+(?:\.[0-9xX]+)?)/i
                );

                if (versionMatch) {
                    declaredVersion = normalizeVersion(versionMatch[1]);
                }
            }

            if (!scriptType) {

                const typeMatch = source.match(
                    /@NScriptType\s+([^\s*]+)/i
                );

                if (typeMatch) {
                    scriptType = typeMatch[1];
                }
            }

            if (!legacyApiDetected) {
                legacyApiDetected =
                    /\bnlapi[A-Za-z0-9_]*\b/.test(source) ||
                    /\bnlobj[A-Za-z0-9_]*\b/.test(source);
            }

            if (!amdModuleDetected) {
                amdModuleDetected =
                    /\b(?:define|require)\s*\(/.test(source);
            }

            carry = source.slice(-REGEX_OVERLAP);
        }

        // An explicit declaration is the strongest signal.
        if (declaredVersion) {
            return {
                version: declaredVersion,
                scriptType:
                    scriptType ||
                    (amdModuleDetected
                        ? 'Custom Module / Library'
                        : 'Unknown'),
                detectionMethod: '@NApiVersion'
            };
        }

        // Classic SuiteScript 1.0 normally has no @NApiVersion tag.
        if (legacyApiDetected) {
            return {
                version: '1.0',
                scriptType:
                    scriptType ||
                    'SuiteScript 1.0 / Legacy',
                detectionMethod: 'Legacy nlapi/nlobj API detected'
            };
        }

        // Custom 2.x modules are permitted to omit @NApiVersion.
        if (amdModuleDetected) {
            return {
                version: 'Unspecified',
                scriptType:
                    scriptType ||
                    'Custom Module / Library',
                detectionMethod: '2.x module syntax; no @NApiVersion'
            };
        }

        return {
            version: 'Unknown',
            scriptType:
                scriptType ||
                'Plain JavaScript / Unknown',
            detectionMethod: 'No SuiteScript version marker detected'
        };
    };

    const determineAction = (version, sourceArea) => {

        const installedContent =
            sourceArea === ROOT_SUITE_APPS ||
            sourceArea === ROOT_SUITE_BUNDLES;

        if (version === '2.1') {
            return 'OK';
        }

        if (version === 'Unreadable') {
            return installedContent
                ? 'VERIFY WITH VENDOR'
                : 'REVIEW';
        }

        if (
            installedContent &&
            (version === '1.0' ||
                version === '2.0' ||
                version === '2.x')
        ) {
            return 'CONTACT VENDOR';
        }

        switch (version) {
            case '2.0':
            case '2.x':
                return 'UPDATE TO 2.1';
            case '1.0':
                return 'CONVERT TO 2.1';
            case 'Unspecified':
                return installedContent
                    ? 'VERIFY WITH VENDOR'
                    : 'REVIEW MODULE';
            default:
                return installedContent
                    ? 'VERIFY WITH VENDOR'
                    : 'REVIEW';
        }
    };

    const buildNotes = ({
        sourceArea,
        version,
        scriptType,
        readable,
        readError
    }) => {

        const notes = [];

        if (!readable) {
            notes.push('Source could not be read.');

            if (readError) {
                notes.push(readError);
            }
        }

        if (
            sourceArea === ROOT_SUITE_APPS ||
            sourceArea === ROOT_SUITE_BUNDLES
        ) {
            notes.push(
                'Installed/bundled content; verify ownership or publisher update before modifying.'
            );
        }

        if (version === '2.x') {
            notes.push(
                'Explicit 2.x declaration should be changed to 2.1.'
            );
        }

        if (version === 'Unspecified') {
            notes.push(
                '@NApiVersion is optional for custom modules; review compatibility with calling scripts.'
            );
        }

        if (
            version === 'Unknown' &&
            scriptType === 'Plain JavaScript / Unknown'
        ) {
            notes.push(
                'May be a third-party JavaScript library rather than a SuiteScript entry point.'
            );
        }

        return notes.join(' ');
    };

    const classifySourceArea = path => {

        if (!path) {
            return '';
        }

        const normalized = normalizePath(path);

        if (/^\/SuiteScripts(?:\/|$)/i.test(normalized)) {
            return ROOT_SUITE_SCRIPTS;
        }

        if (/^\/SuiteBundles(?:\/|$)/i.test(normalized)) {
            return ROOT_SUITE_BUNDLES;
        }

        if (/^\/SuiteApps(?:\/|$)/i.test(normalized)) {
            return ROOT_SUITE_APPS;
        }

        return '';
    };

    /**
     * Resolve a File Cabinet folder hierarchy. This fallback is mainly used
     * when file.load() is denied but the file's folder remains searchable.
     */
    const getFolderPath = (folderId, visited = {}) => {

        if (!folderId) {
            return '';
        }

        const cacheKey = String(folderId);

        if (folderPathCache[cacheKey]) {
            return folderPathCache[cacheKey];
        }

        if (visited[cacheKey]) {
            return '';
        }

        visited[cacheKey] = true;

        try {

            const folderData = search.lookupFields({
                type: search.Type.FOLDER,
                id: folderId,
                columns: ['name', 'parent']
            });

            const folderName = folderData.name || '';
            const parentId = getSearchValue(folderData.parent);

            const parentPath = parentId
                ? getFolderPath(parentId, visited)
                : '';

            const path = normalizePath(
                `${parentPath}/${folderName}`
            );

            folderPathCache[cacheKey] = path;
            return path;

        } catch (e) {

            log.debug({
                title: 'Unable to resolve folder path',
                details: {
                    folderId,
                    error: formatError(e)
                }
            });

            return '';
        }
    };

    const getFolderFromFilePath = path => {

        if (!path) {
            return '';
        }

        const normalized = normalizePath(path);
        const position = normalized.lastIndexOf('/');

        if (position <= 0) {
            return '';
        }

        return normalized.substring(0, position);
    };

    const normalizePath = value => {

        if (!value) {
            return '';
        }

        let result = String(value)
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/')
            .trim();

        if (!result.startsWith('/')) {
            result = '/' + result;
        }

        if (result.length > 1 && result.endsWith('/')) {
            result = result.substring(0, result.length - 1);
        }

        return result;
    };

    // File search folder text can look like "SuiteScripts : Custom : Lib".
    const normalizeFolderText = value => {

        if (!value) {
            return '';
        }

        return normalizePath(
            String(value).replace(/\s+:\s+/g, '/')
        );
    };

    const getSearchValue = value => {

        if (value === null || value === undefined) {
            return '';
        }

        if (Array.isArray(value)) {
            return value.length
                ? getSearchValue(value[0])
                : '';
        }

        if (typeof value === 'object') {
            return value.value !== undefined
                ? value.value
                : '';
        }

        return value;
    };

    const getSearchText = value => {

        if (value === null || value === undefined) {
            return '';
        }

        if (Array.isArray(value)) {
            return value.length
                ? getSearchText(value[0])
                : '';
        }

        if (typeof value === 'object') {
            return value.text !== undefined
                ? value.text
                : '';
        }

        return String(value);
    };

    const normalizeVersion = version => {

        const value = String(version || '').trim();

        if (/^2\.x$/i.test(value)) {
            return '2.x';
        }

        return value;
    };

    const compareAuditRows = (a, b) => {

        const actionRank = {
            'CONVERT TO 2.1': 1,
            'UPDATE TO 2.1': 2,
            'CONTACT VENDOR': 3,
            'VERIFY WITH VENDOR': 4,
            'REVIEW': 5,
            'REVIEW MODULE': 6,
            'OK': 9
        };

        const rankA = actionRank[a.action] || 7;
        const rankB = actionRank[b.action] || 7;

        if (rankA !== rankB) {
            return rankA - rankB;
        }

        const sourceCompare = String(a.source || '').localeCompare(
            String(b.source || '')
        );

        if (sourceCompare !== 0) {
            return sourceCompare;
        }

        const folderCompare = String(a.folder || '').localeCompare(
            String(b.folder || '')
        );

        if (folderCompare !== 0) {
            return folderCompare;
        }

        return String(a.fileName || '').localeCompare(
            String(b.fileName || '')
        );
    };

    /**
     * Quote CSV values and mitigate formula injection when opened in Excel.
     */
    const csvEscape = value => {

        let text =
            value === null || value === undefined
                ? ''
                : String(value);

        if (/^[=+\-@]/.test(text)) {
            text = "'" + text;
        }

        return '"' + text.replace(/"/g, '""') + '"';
    };

    const createTimestamp = () => {

        return new Date()
            .toISOString()
            .replace(/\.\d{3}Z$/, 'Z')
            .replace(/[-:]/g, '')
            .replace('T', '_');
    };

    const updateTotals = (totals, row) => {

        totals.total++;

        switch (row.source) {
            case ROOT_SUITE_SCRIPTS:
                totals.suiteScripts++;
                break;
            case ROOT_SUITE_BUNDLES:
                totals.suiteBundles++;
                break;
            case ROOT_SUITE_APPS:
                totals.suiteApps++;
                break;
        }

        switch (row.version) {
            case '2.1':
                totals.version21++;
                break;
            case '2.0':
                totals.version20++;
                break;
            case '2.x':
                totals.version2x++;
                break;
            case '1.0':
                totals.version10++;
                break;
            case 'Unspecified':
                totals.unspecified++;
                break;
            case 'Unknown':
                totals.unknown++;
                break;
            case 'Unreadable':
                totals.unreadable++;
                break;
        }
    };

    const formatError = e => {

        if (!e) {
            return 'Unknown error';
        }

        return `${e.name || 'ERROR'}: ${e.message || String(e)}`;
    };

    const logInputError = summary => {

        if (summary.inputSummary && summary.inputSummary.error) {
            log.error({
                title: 'INPUT ERROR',
                details: summary.inputSummary.error
            });
        }
    };

    const logStageErrors = (stageName, stageSummary) => {

        if (!stageSummary || !stageSummary.errors) {
            return;
        }

        stageSummary.errors.iterator().each((key, error) => {
            log.error({
                title: `${stageName} ERROR - ${key}`,
                details: error
            });

            return true;
        });
    };

    return {
        getInputData,
        map,
        reduce,
        summarize
    };
});
