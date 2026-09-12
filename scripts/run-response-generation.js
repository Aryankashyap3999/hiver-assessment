import { retrieveSimilarCases } from "../src/retrieval.js";
import { generateResponse } from "../src/response-generation.js";

const currentMessage = process.argv[2];
const predictedIntent = process.argv[3];

if (!currentMessage || !predictedIntent) {
    console.error('Usage: node scripts/run-response-generation.js "<customer message>" "<predicted intent>"');
    process.exit(1);
}

async function main() {
    console.log(`Customer message: ${currentMessage}`);
    console.log(`Predicted intent: ${predictedIntent}\n`);

    console.log("Retrieving historical examples...");
    const retrievedExamples = await retrieveSimilarCases(currentMessage);
    console.log(`Found ${retrievedExamples.length} historical example(s).`);

    console.log("\nGenerating response...");
    const response = await generateResponse({
        currentMessage,
        context: [],
        predictedIntent,
        retrievedExamples
    });

    console.log("\nDraft reply:");
    console.log(response.reply);
    console.log(`\nEvidence (example numbers): ${JSON.stringify(response.evidence)}`);
    console.log(`Confidence: ${response.confidence}`);
}

main().catch((error) => {
    console.error("Response generation failed:", error);
    process.exit(1);
});
