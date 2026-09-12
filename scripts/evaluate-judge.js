import fs from "fs";
import { parse } from "csv-parse/sync";

const JUDGE_RESULTS_PATH = "processed/judge-results.json";
const GOLDEN_LABELS_PATH = "processed/golden-set-labeling.csv";

const DIMENSIONS = ["correctness", "relevance", "helpfulness", "grounding", "avoidsUnsupportedClaims"];

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

function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function main() {
    console.log("Loading judge results...");
    const { results } = JSON.parse(fs.readFileSync(JUDGE_RESULTS_PATH, "utf8"));

    console.log("Loading golden labels...");
    const goldenLabels = loadGoldenLabels();

    console.log(`\nCases judged: ${results.length}\n`);

    console.log("=== Mean scores (1-5) ===");
    for (const dimension of DIMENSIONS) {
        const scores = results.map((result) => result.judgment[dimension]);
        console.log(`${dimension}: ${mean(scores).toFixed(2)}`);
    }

    const labeled = results.filter((result) => goldenLabels.has(result.caseId));
    const correctlyClassified = labeled.filter(
        (result) => goldenLabels.get(result.caseId) === result.predictedIntent
    );
    const misclassified = labeled.filter(
        (result) => goldenLabels.get(result.caseId) !== result.predictedIntent
    );

    console.log("\n=== Does the judge track known classification correctness? ===");
    console.log("(There are no separate human ratings of response quality to compare against --");
    console.log(" this checks whether judge scores are lower on cases independently known to be");
    console.log(" misclassified, using the human-reviewed golden intent labels as ground truth.)");

    if (correctlyClassified.length === 0 || misclassified.length === 0) {
        console.log("Not enough labeled cases in both groups in this run to compare.");
    } else {
        for (const dimension of DIMENSIONS) {
            const correctMean = mean(correctlyClassified.map((result) => result.judgment[dimension]));
            const misclassifiedMean = mean(misclassified.map((result) => result.judgment[dimension]));

            console.log(
                `${dimension}: correctly-classified=${correctMean.toFixed(2)}, ` +
                `misclassified=${misclassifiedMean.toFixed(2)}`
            );
        }
    }

    console.log(`\nCorrectly classified cases judged: ${correctlyClassified.length}`);
    console.log(`Misclassified cases judged: ${misclassified.length}`);

    const safetyNetMisses = misclassified.filter((result) => result.escalation.autoHandle);
    const safetyNetCatches = misclassified.filter((result) => !result.escalation.autoHandle);

    console.log("\n=== Misclassified cases that were auto-handled anyway (the worst case) ===");
    console.log(`Count: ${safetyNetMisses.length} (vs. ${safetyNetCatches.length} misclassified cases correctly escalated)`);

    if (safetyNetMisses.length > 0) {
        for (const dimension of DIMENSIONS) {
            const missMean = mean(safetyNetMisses.map((result) => result.judgment[dimension]));
            console.log(`  ${dimension}: ${missMean.toFixed(2)}`);
        }
        console.log(
            "If these scores are as high as the overall average, the judge is not detecting these " +
            "cases as lower quality -- it never sees the gold label, so it can only judge whether the " +
            "reply text itself is reasonable, not whether the taxonomy label matched."
        );
    }
}

main().catch((error) => {
    console.error("Judge evaluation scoring failed:", error);
    process.exit(1);
});
