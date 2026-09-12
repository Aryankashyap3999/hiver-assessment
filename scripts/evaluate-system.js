import fs from "fs";
import { parse } from "csv-parse/sync";

const RESULTS_PATH = "processed/system-evaluation-results.json";
const GOLDEN_LABELS_PATH = "processed/golden-set-labeling.csv";

const SIGNOFF_PATTERN = /\^[A-Z]{2,3}\b/;

function loadGoldenLabels() {
    const csvContent = fs.readFileSync(GOLDEN_LABELS_PATH, "utf8");

    const rows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true
    });

    const labels = new Map();

    for (const row of rows) {
        labels.set(row.caseId, row.goldIntent);
    }

    return labels;
}

function categorizeReason(reason) {
    if (reason.startsWith("Intent could not be confidently classified")) return "unclear_intent";
    if (reason.includes("is a sensitive category")) return "sensitive_intent";
    if (reason.startsWith("No relevant historical evidence")) return "no_evidence";
    if (reason.startsWith("The drafted response is not grounded")) return "not_grounded";
    if (reason.startsWith("Response confidence")) return "low_confidence";
    return "auto_handled";
}

function evaluateGrounding(results) {
    const withRetrieval = results.filter((result) => result.retrievedCount > 0);
    const withEvidence = results.filter((result) => result.response.evidence.length > 0);

    const meanTopRetrievalScore = withRetrieval.length
        ? withRetrieval.reduce((sum, result) => sum + result.topRetrievalScore, 0) / withRetrieval.length
        : 0;

    const meanConfidence =
        results.reduce((sum, result) => sum + result.response.confidence, 0) / results.length;

    return {
        total: results.length,
        withRetrieval: withRetrieval.length,
        withEvidence: withEvidence.length,
        meanTopRetrievalScore,
        meanConfidence
    };
}

function evaluateResponseQuality(results) {
    const signoffLeaks = results.filter((result) => SIGNOFF_PATTERN.test(result.response.reply));

    // Character count, not word count: several golden cases are in Japanese/German
    // (AmazonHelp replies in the customer's language), and Japanese doesn't delimit
    // words with spaces, so whitespace-based word counts are meaningless for those replies.
    const charCounts = results.map((result) => result.response.reply.trim().length);
    const meanCharCount = charCounts.reduce((sum, count) => sum + count, 0) / charCounts.length;
    const veryShortReplies = charCounts.filter((count) => count < 15).length;

    return {
        signoffLeakCount: signoffLeaks.length,
        signoffLeakCaseIds: signoffLeaks.map((result) => result.caseId),
        meanCharCount,
        veryShortReplies
    };
}

function evaluateEscalation(results, goldenLabels) {
    const reasonCounts = {};
    let autoHandled = 0;

    for (const result of results) {
        const category = categorizeReason(result.escalation.reason);
        reasonCounts[category] = (reasonCounts[category] || 0) + 1;

        if (result.escalation.autoHandle) autoHandled++;
    }

    const labeledResults = results.filter((result) => goldenLabels.has(result.caseId));
    const misclassified = labeledResults.filter(
        (result) => goldenLabels.get(result.caseId) !== result.predictedIntent
    );
    const misclassifiedButAutoHandled = misclassified.filter((result) => result.escalation.autoHandle);

    const correctlyClassified = labeledResults.filter(
        (result) => goldenLabels.get(result.caseId) === result.predictedIntent
    );
    const correctButEscalated = correctlyClassified.filter((result) => !result.escalation.autoHandle);

    return {
        total: results.length,
        autoHandled,
        reasonCounts,
        labeledCases: labeledResults.length,
        misclassifiedCases: misclassified.length,
        misclassifiedButAutoHandled: misclassifiedButAutoHandled.length,
        correctlyClassifiedCases: correctlyClassified.length,
        correctButEscalated: correctButEscalated.length
    };
}

async function main() {
    console.log("Loading system evaluation results...");
    const { results } = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));

    console.log("Loading golden labels...");
    const goldenLabels = loadGoldenLabels();

    console.log("\n=== Evidence grounding ===");
    const grounding = evaluateGrounding(results);
    console.log(
        `Cases with retrieved evidence: ${grounding.withRetrieval}/${grounding.total} ` +
        `(${((grounding.withRetrieval / grounding.total) * 100).toFixed(1)}%)`
    );
    console.log(
        `Cases where the response cited evidence: ${grounding.withEvidence}/${grounding.total} ` +
        `(${((grounding.withEvidence / grounding.total) * 100).toFixed(1)}%)`
    );
    console.log(`Mean top retrieval score (when evidence exists): ${grounding.meanTopRetrievalScore.toFixed(3)}`);
    console.log(`Mean response confidence: ${grounding.meanConfidence.toFixed(3)}`);

    console.log("\n=== Response quality (automated proxies, not semantic judgment) ===");
    const quality = evaluateResponseQuality(results);
    console.log(`Replies leaking a historical agent sign-off: ${quality.signoffLeakCount}/${results.length}`);
    if (quality.signoffLeakCount > 0) {
        console.log(`  Case IDs: ${quality.signoffLeakCaseIds.join(", ")}`);
    }
    console.log(`Mean reply length: ${quality.meanCharCount.toFixed(0)} characters`);
    console.log(`Very short replies (<15 characters): ${quality.veryShortReplies}`);

    console.log("\n=== Escalation ===");
    const escalation = evaluateEscalation(results, goldenLabels);
    console.log(
        `Auto-handled: ${escalation.autoHandled}/${escalation.total} ` +
        `(${((escalation.autoHandled / escalation.total) * 100).toFixed(1)}%)`
    );
    console.log("Escalation reason categories:");
    for (const [category, count] of Object.entries(escalation.reasonCounts)) {
        console.log(`  ${count}x - ${category}`);
    }

    if (escalation.labeledCases === 0) {
        console.log("\nNo cases in this run matched golden labels; skipping the classifier-safety-net breakdown.");
        return;
    }

    console.log(`\nLabeled cases: ${escalation.labeledCases}`);
    console.log(`Misclassified (predictedIntent != goldIntent): ${escalation.misclassifiedCases}`);
    console.log(`  Caught by escalation (not auto-handled): ${escalation.misclassifiedCases - escalation.misclassifiedButAutoHandled}`);
    console.log(`  Auto-handled anyway (missed by the safety net): ${escalation.misclassifiedButAutoHandled}`);
    console.log(`Correctly classified: ${escalation.correctlyClassifiedCases}`);
    console.log(`  Escalated anyway (reduces automation, not a wrong call): ${escalation.correctButEscalated}`);
}

main().catch((error) => {
    console.error("System evaluation scoring failed:", error);
    process.exit(1);
});
