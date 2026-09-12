import fs from "fs";
import readline from "readline";
import { classifyIntent } from "../src/intent-classification.js";
import { retrieveSimilarCases } from "../src/retrieval.js";
import { generateResponse } from "../src/response-generation.js";
import { decideEscalation } from "../src/escalation.js";

const GOLDEN_SET_PATH = "processed/golden-set.jsonl";
const RESULTS_PATH = "processed/system-evaluation-results.json";
const INTENT_PREDICTIONS_PATH = "processed/system-intent-predictions.json";

async function loadCases(inputPath) {
    const cases = [];

    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;

        cases.push(JSON.parse(line));
    }

    return cases;
}

function saveResults(results) {
    fs.writeFileSync(
        RESULTS_PATH,
        JSON.stringify({ evaluationCases: results.length, results }, null, 2)
    );

    fs.writeFileSync(
        INTENT_PREDICTIONS_PATH,
        JSON.stringify(
            {
                classifier: "llm-system",
                evaluationCases: results.length,
                predictions: results.map((result) => ({
                    caseId: result.caseId,
                    predictedIntent: result.predictedIntent
                }))
            },
            null,
            2
        )
    );
}

async function evaluateCase(caseData) {
    const predictedIntent = await classifyIntent(caseData.currentMessage);
    const retrievedExamples = await retrieveSimilarCases(caseData.currentMessage);
    const response = await generateResponse({
        currentMessage: caseData.currentMessage,
        context: [],
        predictedIntent,
        retrievedExamples
    });
    const escalation = decideEscalation({ predictedIntent, retrievedExamples, response });

    return {
        caseId: caseData.caseId,
        predictedIntent,
        retrievedCount: retrievedExamples.length,
        topRetrievalScore: retrievedExamples.length ? retrievedExamples[0].score : 0,
        response,
        escalation
    };
}

async function main() {
    const inputPath = process.argv[2] || GOLDEN_SET_PATH;

    console.log("Loading input cases...");
    const cases = await loadCases(inputPath);

    const results = [];

    for (let i = 0; i < cases.length; i++) {
        const caseData = cases[i];

        console.log(`Evaluating case ${i + 1}/${cases.length}: ${caseData.caseId}`);

        const result = await evaluateCase(caseData);
        results.push(result);

        saveResults(results);
    }

    console.log("\nSystem evaluation:");
    console.log(`Cases evaluated: ${results.length}`);
    console.log(`Results: ${RESULTS_PATH}`);
    console.log(`Intent predictions: ${INTENT_PREDICTIONS_PATH}`);
}

main().catch((error) => {
    console.error("System evaluation failed:", error);
    process.exit(1);
});
