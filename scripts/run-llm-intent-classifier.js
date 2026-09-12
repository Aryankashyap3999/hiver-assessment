import fs from "fs";
import readline from "readline";
import { classifyIntent } from "../src/intent-classification.js";

const GOLDEN_SET_PATH = "processed/golden-set.jsonl";
const OUTPUT_PATH = "processed/llm-intent-results.json";

async function loadGoldenSet(inputPath) {
    const cases = [];

    const fileStream = fs.createReadStream(inputPath);

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

function saveResults(predictions) {
    const results = {
        classifier: "llm",
        evaluationCases: predictions.length,
        predictions
    };

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(results, null, 2)
    );
}

async function runClassifier() {
    const inputPath = process.argv[2] || GOLDEN_SET_PATH;

    console.log("Loading input cases...");
    const goldenCases = await loadGoldenSet(inputPath);

    const predictions = [];

    for (let i = 0; i < goldenCases.length; i++) {
        const caseData = goldenCases[i];

        console.log(`Classifying case ${i + 1}/${goldenCases.length}: ${caseData.caseId}`);

        const predictedIntent = await classifyIntent(caseData.currentMessage);

        predictions.push({
            caseId: caseData.caseId,
            predictedIntent
        });

        saveResults(predictions);
    }

    console.log("\nLLM classifier:");
    console.log(`Evaluation cases: ${predictions.length}`);
    console.log(`Output: ${OUTPUT_PATH}`);
}

runClassifier().catch((error) => {
    console.error("Failed to run LLM intent classifier:", error);
    process.exit(1);
});
