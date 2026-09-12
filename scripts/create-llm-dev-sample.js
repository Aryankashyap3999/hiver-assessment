import fs from "fs";
import readline from "readline";

const INPUT_PATH = "processed/evaluation-corpus.jsonl";
const OUTPUT_PATH = "processed/llm-dev-sample.jsonl";
const SAMPLE_SIZE = 20;

async function createSample() {
    const fileStream = fs.createReadStream(INPUT_PATH);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const samples = [];

    for await (const line of rl) {
        if (!line.trim()) continue;

        const conversation = JSON.parse(line);

        for (const message of conversation.messages) {
            if (message.role !== "customer") continue;

            if (message.text && message.text.trim()) {
                samples.push({
                    caseId: `${conversation.conversationId}:${message.tweetId}`,
                    currentMessage: message.text
                });
            }

            if (samples.length >= SAMPLE_SIZE) {
                break;
            }
        }

        if (samples.length >= SAMPLE_SIZE) {
            break;
        }
    }

    fs.writeFileSync(
        OUTPUT_PATH,
        samples.map((sample) => JSON.stringify(sample)).join("\n") + "\n"
    );

    console.log(`Development cases created: ${samples.length}`);
    console.log(`Output: ${OUTPUT_PATH}`);
}

createSample().catch((error) => {
    console.error("Failed to create development sample:", error);
    process.exit(1);
});