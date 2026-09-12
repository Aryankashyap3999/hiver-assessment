import fs from "fs";
import readline from "readline";

const GOLDEN_SET_PATH = "processed/golden-set.jsonl";
const CONVERSATIONS_PATH = "processed/amazonhelp-conversations.jsonl";
const OUTPUT_PATH = "processed/evaluation-corpus.jsonl";

async function loadGoldenConversationIds() {
    const goldenConversationIds = new Set();

    const fileStream = fs.createReadStream(GOLDEN_SET_PATH);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        const caseData = JSON.parse(line);

        if (caseData.conversationId) {
            goldenConversationIds.add(caseData.conversationId);
        }
    }

    return goldenConversationIds;
}

async function createEvaluationCorpus() {
    console.log("Loading golden-set conversation IDs...");

    const goldenConversationIds = await loadGoldenConversationIds();

    console.log(
        `Golden conversations excluded: ${goldenConversationIds.size}`
    );

    const inputStream = fs.createReadStream(CONVERSATIONS_PATH);
    const outputStream = fs.createWriteStream(OUTPUT_PATH);

    const rl = readline.createInterface({
        input: inputStream,
        crlfDelay: Infinity
    });

    let conversationsRead = 0;
    let conversationsExcluded = 0;
    let conversationsWritten = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        const conversation = JSON.parse(line);

        conversationsRead++;

        if (goldenConversationIds.has(conversation.conversationId)) {
            conversationsExcluded++;
            continue;
        }

        outputStream.write(JSON.stringify(conversation) + "\n");
        conversationsWritten++;
    }

    await new Promise((resolve, reject) => {
        outputStream.end(resolve);
        outputStream.on("error", reject);
    });

    console.log("\nEvaluation corpus created.");
    console.log(`Conversations read: ${conversationsRead}`);
    console.log(`Conversations excluded: ${conversationsExcluded}`);
    console.log(`Conversations written: ${conversationsWritten}`);
    console.log(`Output: ${OUTPUT_PATH}`);
}

createEvaluationCorpus().catch((error) => {
    console.error("Failed to create evaluation corpus:", error);
    process.exit(1);
});