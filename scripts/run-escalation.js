import { retrieveSimilarCases } from "../src/retrieval.js";
import { generateResponse } from "../src/response-generation.js";
import { decideEscalation } from "../src/escalation.js";

const currentMessage = process.argv[2];
const predictedIntent = process.argv[3];

if (!currentMessage || !predictedIntent) {
    console.error('Usage: node scripts/run-escalation.js "<customer message>" "<predicted intent>"');
    process.exit(1);
}

async function main() {
    console.log(`Customer message: ${currentMessage}`);
    console.log(`Predicted intent: ${predictedIntent}\n`);

    const retrievedExamples = await retrieveSimilarCases(currentMessage);
    console.log(`Retrieved examples: ${retrievedExamples.length}`);

    const response = await generateResponse({
        currentMessage,
        context: [],
        predictedIntent,
        retrievedExamples
    });
    console.log(`Draft reply: ${response.reply}`);
    console.log(`Evidence: ${JSON.stringify(response.evidence)}, Confidence: ${response.confidence}\n`);

    const escalation = decideEscalation({ predictedIntent, retrievedExamples, response });

    console.log(`autoHandle: ${escalation.autoHandle}`);
    console.log(`reason: ${escalation.reason}`);
}

main().catch((error) => {
    console.error("Escalation check failed:", error);
    process.exit(1);
});
