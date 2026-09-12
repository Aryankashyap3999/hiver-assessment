import { classifyIntent } from "../src/intent-classification.js";
import { retrieveSimilarCases } from "../src/retrieval.js";
import { generateResponse } from "../src/response-generation.js";
import { decideEscalation } from "../src/escalation.js";

const message = process.argv[2];

if (!message) {
    console.error('Usage: node scripts/run-agent.js "<customer message>"');
    process.exit(1);
}

async function main() {
    console.log(`Customer message: ${message}\n`);

    console.log("Classifying intent...");
    const predictedIntent = await classifyIntent(message);
    console.log(`Predicted intent: ${predictedIntent}\n`);

    console.log("Retrieving historical examples...");
    const retrievedExamples = await retrieveSimilarCases(message);
    console.log(`Found ${retrievedExamples.length} historical example(s).\n`);

    console.log("Generating response...");
    const response = await generateResponse({
        currentMessage: message,
        context: [],
        predictedIntent,
        retrievedExamples
    });
    console.log(`Draft reply: ${response.reply}\n`);

    const escalation = decideEscalation({ predictedIntent, retrievedExamples, response });

    const result = {
        message,
        predictedIntent,
        retrievedExamples: retrievedExamples.map((example) => ({
            conversationId: example.conversationId,
            messageId: example.messageId,
            score: example.score
        })),
        response,
        escalation
    };

    console.log("Final result:");
    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error("Agent run failed:", error);
    process.exit(1);
});
