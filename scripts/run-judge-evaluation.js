import fs from "fs";
import readline from "readline";
import { retrieveSimilarCases } from "../src/retrieval.js";
import { judgeResponse } from "../src/llm-judge.js";

const GOLDEN_SET_PATH = "processed/golden-set.jsonl";
const SYSTEM_RESULTS_PATH = "processed/system-evaluation-results.json";
const OUTPUT_PATH = "processed/judge-results.json";

async function loadMessagesById(inputPath) {
    const messages = new Map();

    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;

        const caseData = JSON.parse(line);
        messages.set(caseData.caseId, caseData.currentMessage);
    }

    return messages;
}

function saveResults(results) {
    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify({ evaluationCases: results.length, results }, null, 2)
    );
}

async function main() {
    const limit = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;

    console.log("Loading golden messages...");
    const messagesById = await loadMessagesById(GOLDEN_SET_PATH);

    console.log("Loading system evaluation results...");
    const { results: systemResults } = JSON.parse(fs.readFileSync(SYSTEM_RESULTS_PATH, "utf8"));

    const casesToJudge = limit ? systemResults.slice(0, limit) : systemResults;

    const results = [];

    for (let i = 0; i < casesToJudge.length; i++) {
        const systemResult = casesToJudge[i];
        const currentMessage = messagesById.get(systemResult.caseId);

        console.log(`Judging case ${i + 1}/${casesToJudge.length}: ${systemResult.caseId}`);

        const retrievedExamples = await retrieveSimilarCases(currentMessage);

        const judgment = await judgeResponse({
            currentMessage,
            predictedIntent: systemResult.predictedIntent,
            retrievedExamples,
            response: systemResult.response
        });

        results.push({
            caseId: systemResult.caseId,
            predictedIntent: systemResult.predictedIntent,
            escalation: systemResult.escalation,
            judgment
        });

        saveResults(results);
    }

    console.log("\nJudge evaluation:");
    console.log(`Cases judged: ${results.length}`);
    console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch((error) => {
    console.error("Judge evaluation failed:", error);
    process.exit(1);
});
