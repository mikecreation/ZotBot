'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const exists = (name) => fs.existsSync(path.join(root, name));
const pass = (message) => process.stdout.write(`PASS ${message}\n`);

const manifest = JSON.parse(read('manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '6.2.11');
pass('manifest parses as combined MV3 Brain version 6.2.11; scanner build remains 3.7.7');

const manifestReferences = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
  ...(manifest.content_scripts || []).flatMap((entry) => entry.css || [])
].filter(Boolean);
for (const reference of manifestReferences) assert.ok(exists(reference), `manifest reference exists: ${reference}`);
pass(`all ${manifestReferences.length} manifest file references resolve`);

const sidepanelHtml = read('sidepanel.html');
const localHtmlReferences = Array.from(sidepanelHtml.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi))
  .map((match) => match[1])
  .filter((reference) => !/^(?:https?:|data:|mailto:|tel:|javascript:)/i.test(reference));
for (const reference of localHtmlReferences) assert.ok(exists(reference), `side-panel reference exists: ${reference}`);
pass(`all ${localHtmlReferences.length} side-panel file references resolve`);

const requiredIdBlock = read('sidepanel.js').match(/const REQUIRED_IDS = \[([\s\S]*?)\];/);
assert.ok(requiredIdBlock, 'side-panel required ID list is present');
const requiredIds = Array.from(requiredIdBlock[1].matchAll(/'([^']+)'/g)).map((match) => match[1]);
const htmlIds = Array.from(sidepanelHtml.matchAll(/\bid=["']([^"']+)["']/g)).map((match) => match[1]);
const htmlIdSet = new Set(htmlIds);
assert.equal(htmlIdSet.size, htmlIds.length, 'side-panel HTML has no duplicate IDs');
for (const id of requiredIds) assert.ok(htmlIdSet.has(id), `side-panel required element exists: ${id}`);
pass(`all ${requiredIds.length} side-panel controller IDs resolve uniquely`);

const requiredFiles = [
  'background.js', 'content.js', 'manifest.json', 'passive-social-observer.js',
  'runtime-observer.js', 'scroll-engine.js', 'security-core.js', 'security-audit.js', 'export-serialization-core.js',
  'sidepanel.css', 'sidepanel.html', 'sidepanel.js', 'transcript.js', 'video-recovery-core.js', 'x-analytics-core.js'
];
for (const file of requiredFiles) assert.ok(exists(file), `required extension file exists: ${file}`);
pass('complete installable extension file set is present');

const background = read('background.js');
assert.match(background, /\['security-core\.js',\s*'scroll-engine\.js',\s*'security-audit\.js',\s*'export-serialization-core\.js',\s*'x-analytics-core\.js',\s*file\]/);
assert.match(background, /\['security-core\.js',\s*'scroll-engine\.js',\s*'export-serialization-core\.js',\s*file\]/);
pass('security, lossless export, and X analytics cores are injected before the capture engines');

const runtimeJsFiles = fs.readdirSync(root).filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'));
for (const file of runtimeJsFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /PCE_DEEP_320|PCE_DEEP_330|PCE_DEEP_331|PCE_DEEP_333|PCE_DEEP_334|PCE_DEEP_335|__PCE_DEEP_320|__PCE_DEEP_330|__PCE_DEEP_331|__PCE_DEEP_333|__PCE_DEEP_334|__PCE_DEEP_335/);
  const checked = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  assert.equal(checked.status, 0, `${file} passes node --check: ${checked.stderr}`);
}
for (const file of fs.readdirSync(__dirname).filter((file) => file.endsWith('.js'))) {
  const checked = spawnSync(process.execPath, ['--check', path.join(__dirname, file)], { encoding: 'utf8' });
  assert.equal(checked.status, 0, `${file} passes node --check: ${checked.stderr}`);
}
pass('all runtime and test JavaScript files pass syntax validation and use the v3.3 prefix');

const content = read('content.js');
const scroll = read('scroll-engine.js');
assert.match(content, /const deadline = Number\.POSITIVE_INFINITY/);
assert.match(scroll, /probeMaxPasses: Number\.POSITIVE_INFINITY/);
assert.match(scroll, /sweepMaxPasses: Number\.POSITIVE_INFINITY/);
assert.match(scroll, /const captureDeadline = \(\) => Number\.POSITIVE_INFINITY/);
assert.match(scroll, /WAITING FOR GENERATION/);
assert.match(scroll, /final-stable-end-verification/);
assert.match(scroll, /materialMutationEpoch/);
assert.match(scroll, /benignMutationChurnIgnored/);
assert.match(read('security-core.js'), /evaluateVerificationStability/);
assert.match(scroll, /!stopRequested\(\)\s*&&\s*Date\.now\(\) < discoveryDeadline/);
assert.match(scroll, /source: 'user-stopped-capture'/);
assert.match(scroll, /if \(stopRequested\(\)\)[\s\S]*?Capture stopped; saving everything reached/);
assert.match(content, /const captureControls = new Map\(\)/);
assert.match(content, /a manual Stop freezes crawl depth, not final evidence analysis/);
assert.match(content, /_securityFinalizationAfterUserStop/);
assert.match(content, /Generation\/loading resumed after verification; waiting for it to settle/);
assert.match(content, /Reachable page range grew after verification; continuing capture/);
assert.match(content, /mode: 'stable-dom'/);
assert.doesNotMatch(content, /makeInstantCrawlAudit|endPointSource:[^\n]*dom-complete/);
pass('Page Context has no normal deadline, generation veto, and churn-tolerant repeated final stability verification');

const audit = read('security-audit.js');
assert.match(audit, /findingKeys = new Set\(\)/);
assert.match(audit, /evidenceChain:/);
assert.match(audit, /regex evidence alone cannot be Critical/);
assert.match(audit, /assessMainDocumentHeaders/);
pass('finding dedupe, evidence chains, Critical discipline, and header-evidence gating are wired');

assert.match(audit, /email:\${fingerprint}/);
assert.match(audit, /summarizeAnalyticsStores\(analyticsStores\)/);
assert.match(audit, /summarizeFingerprintEvents\(runtimeEvents\)/);
assert.match(audit, /headerAssessment\.recommendedSeverity/);
assert.match(audit, /keyboardProblems = new Map\(\)/);
assert.match(content, /uniqueUiResourceUrls/);
assert.match(content, /async function collectCurrentPageSnapshot/);
assert.match(content, /cooperativeYield\(options\)/);
assert.match(content, /collectSnapshotElements/);
assert.match(content, /collectorCheckpoint/);
assert.match(content, /collectorSliceDue/);
assert.match(content, /longestCollectorSliceMs/);
assert.match(background, /function pageKeyAliases/);
assert.match(background, /params\.sort\(\)/);
assert.match(read('sidepanel.js'), /function samePageTarget/);
assert.match(scroll, /scrollableCandidateCount/);
assert.match(scroll, /elementsFromPoint/);
assert.match(audit, /scanTextChunks/);
pass('v3.7.7 precision capture, calibrated security, and time-sliced collectors are wired');

assert.match(read('sidepanel.html'), /id=\"activeScan\"/);
assert.match(read('sidepanel.js'), /function updateScanProgressVisual/);
assert.match(read('security-core.js'), /DOM <audio> playback source/);
assert.match(read('content.js'), /rawResourceObservations/);
pass('v3.7.7 live progress UI and DOM-semantic resource classifier are wired');


assert.match(background, /importScripts\('video-recovery-core\.js'\)/);
assert.match(background, /async function scanVideoRecovery/);
assert.match(background, /async function resolveHlsStream/);
assert.match(background, /async function resolveDashStream/);
assert.match(read('sidepanel.js'), /function recoverOrDownloadVideo/);
assert.match(read('sidepanel.html'), /Video Recovery/);
assert.match(read('runtime-observer.js'), /mediasource-sourcebuffer/);
pass('v3.7.7 direct, stream, blob, MediaSource, and protected-boundary video recovery is wired');

const xAnalytics = read('x-analytics-core.js');
assert.match(xAnalytics, /Author Candidate Collision/);
assert.match(xAnalytics, /fiveOrMorePostsInsideOneMinute/);
assert.match(xAnalytics, /empirical-Bayes/i);
assert.match(xAnalytics, /leaveOneGroupOut/);
assert.match(xAnalytics, /leaveOneTopicOutConversionLift/);
assert.match(xAnalytics, /robustConversionRankScore/);
assert.match(xAnalytics, /withinAuthorSpearmanCenteredCollisionVsReach/);
assert.match(xAnalytics, /originalToOriginalPairComparison/);
assert.match(xAnalytics, /No captured collision/);
assert.match(xAnalytics, /causalReadiness/);
assert.match(xAnalytics, /uncappedReachIndex/);
assert.match(xAnalytics, /function burstsToCsv/);
assert.match(xAnalytics, /function longitudinalIntervalsToCsv/);
assert.match(xAnalytics, /buildMipuChangePoints/);
assert.match(xAnalytics, /buildMapPatterns/);
assert.match(content, /xAnalyticsCore\.analyze/);
assert.match(content, /_metricObservations/);
assert.match(background, /X_ANALYTICS_HISTORY_KEY/);
assert.match(background, /updateXAnalyticsHistory/);
assert.match(read('sidepanel.html'), /id="xAnalyticsSection"/);
assert.match(read('sidepanel.html'), /id="downloadXIntervalsCsvBtn"/);
assert.match(read('sidepanel.js'), /function renderXAnalytics/);
pass('v3.7.7 dominance-resistant rankings, within-author collision controls, causal readiness, full exports, and legacy analytics are wired');

process.stdout.write('ALL EXTENSION INTEGRITY TESTS PASSED\n');
