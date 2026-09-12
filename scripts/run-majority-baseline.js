import fs from "fs";
import readline from "readline";

const GOLDEN_SET_PATH = "processed/golden-set.jsonl";
const OUTPUT_PATH = "processed/majority-baseline-results.json";

const BASELINE_INTENT = "OTHER / UNCLEAR";

async function loadGoldenSet() {
    const cases = [];

    const fileStream = fs.createReadStream(GOLDEN_SET_PATH);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        cases.push(JSON.parse(line));
    }

    return cases;
}

async function runBaseline() {
    console.log("Loading golden evaluation set...");

    const goldenCases = await loadGoldenSet();

    const predictions = goldenCases.map((caseData) => ({
        caseId: caseData.caseId,
        predictedIntent: BASELINE_INTENT
    }));

    console.log("\nTrivial baseline:");
    console.log(`Evaluation cases: ${predictions.length}`);
    console.log(`Predicted intent: ${BASELINE_INTENT}`);

    const results = {
        baseline: "constant-other",
        evaluationCases: predictions.length,
        predictedIntent: BASELINE_INTENT,
        predictions
    };

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(results, null, 2)
    );

    console.log(`Output: ${OUTPUT_PATH}`);
}

runBaseline().catch((error) => {
    console.error("Failed to run baseline:", error);
    process.exit(1);
});