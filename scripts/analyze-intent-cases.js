import fs from "fs";
import readline from "readline";

const filePath = "processed/amazonhelp-intent-cases.jsonl";

const acknowledgementPatterns = [
    /^thanks!?$/i,
    /^thank you!?$/i,
    /^thx!?$/i,
    /^okay!?$/i,
    /^ok!?$/i,
    /^got it!?$/i,
    /^done!?$/i,
    /^great!?$/i,
    /^perfect!?$/i,
    /^sure!?$/i,
    /^yes!?$/i,
    /^no!?$/i,
    /^you're welcome!?$/i,
    /^you are welcome!?$/i,
    /^[👍👌🙏❤️]+$/u
];

function isLikelyAcknowledgement(text) {
    const normalized = text.trim();

    return acknowledgementPatterns.some((pattern) =>
        pattern.test(normalized)
    );
}

async function analyze() {
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let totalCases = 0;
    let acknowledgementCases = 0;
    let veryShortCases = 0;
    let questionCases = 0;
    let urlCases = 0;

    const conversationCounts = new Map();

    let totalCharacters = 0;
    let minLength = Infinity;
    let maxLength = 0;

    const samples = [];

    for await (const line of rl) {
        if (!line.trim()) continue;

        const item = JSON.parse(line);

        totalCases++;

        const message = item.currentMessage?.trim() || "";
        const length = message.length;

        totalCharacters += length;
        minLength = Math.min(minLength, length);
        maxLength = Math.max(maxLength, length);

        if (isLikelyAcknowledgement(message)) {
            acknowledgementCases++;
        }

        if (length <= 20) {
            veryShortCases++;
        }

        if (/[?？]/u.test(message)) {
            questionCases++;
        }

        if (/https?:\/\/|www\./i.test(message)) {
            urlCases++;
        }

        const count = conversationCounts.get(item.conversationId) || 0;
        conversationCounts.set(item.conversationId, count + 1);

        if (samples.length < 20) {
            samples.push({
                message,
                contextSize: item.context?.length || 0,
                historicalResponse: item.historicalResponse?.text || ""
            });
        }
    }

    const counts = [...conversationCounts.values()];

    const averageCasesPerConversation =
        totalCases / conversationCounts.size;

    console.log("\n=== Intent Case Analysis ===\n");

    console.log(`Total cases: ${totalCases}`);
    console.log(`Unique conversations: ${conversationCounts.size}`);

    console.log(
        `Average cases per conversation: ${averageCasesPerConversation.toFixed(2)}`
    );

    console.log(`Min message length: ${minLength}`);
    console.log(`Max message length: ${maxLength}`);
    console.log(
        `Average message length: ${(totalCharacters / totalCases).toFixed(2)}`
    );

    console.log("\n=== Potentially Noisy Cases ===\n");

    console.log(
        `Likely acknowledgements: ${acknowledgementCases} ` +
        `(${((acknowledgementCases / totalCases) * 100).toFixed(2)}%)`
    );

    console.log(
        `Very short messages (<=20 chars): ${veryShortCases} ` +
        `(${((veryShortCases / totalCases) * 100).toFixed(2)}%)`
    );

    console.log("\n=== Message Characteristics ===\n");

    console.log(
        `Questions: ${questionCases} ` +
        `(${((questionCases / totalCases) * 100).toFixed(2)}%)`
    );

    console.log(
        `Messages containing URL: ${urlCases} ` +
        `(${((urlCases / totalCases) * 100).toFixed(2)}%)`
    );

    console.log("\n=== Cases Per Conversation ===\n");

    const distribution = {};

    for (const count of counts) {
        distribution[count] = (distribution[count] || 0) + 1;
    }

    for (const key of Object.keys(distribution).sort(
        (a, b) => Number(a) - Number(b)
    )) {
        console.log(
            `${key} case(s): ${distribution[key]} conversation(s)`
        );
    }

    console.log("\n=== Sample Cases ===\n");

    samples.forEach((sample, index) => {
        console.log(`--- Case ${index + 1} ---`);
        console.log(`Current message: ${sample.message}`);
        console.log(`Context messages: ${sample.contextSize}`);
        console.log(`Historical response: ${sample.historicalResponse}`);
        console.log();
    });
}

analyze().catch((error) => {
    console.error("Analysis failed:", error);
    process.exit(1);
});