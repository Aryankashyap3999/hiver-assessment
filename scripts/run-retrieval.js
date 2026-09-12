import { retrieveSimilarCases } from "../src/retrieval.js";

const query = process.argv[2];

if (!query) {
    console.error('Usage: node scripts/run-retrieval.js "<customer message>"');
    process.exit(1);
}

async function main() {
    console.log(`Query: ${query}\n`);

    const results = await retrieveSimilarCases(query);

    if (results.length === 0) {
        console.log("No similar historical cases found.");
        return;
    }

    results.forEach((result, index) => {
        console.log(`--- Match ${index + 1} (score=${result.score.toFixed(3)}) ---`);
        console.log(`Conversation: ${result.conversationId}, Message: ${result.messageId}`);
        console.log(`Historical customer message: ${result.historicalMessage}`);
        console.log(`Historical support response: ${result.historicalResponse.text}`);
        console.log();
    });
}

main().catch((error) => {
    console.error("Retrieval failed:", error);
    process.exit(1);
});
