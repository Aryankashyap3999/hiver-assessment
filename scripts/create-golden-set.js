import fs from "fs";
import readline from "readline";

const inputPath = "processed/amazonhelp-intent-cases.jsonl";
const outputPath = "processed/golden-set.jsonl";
const metadataPath = "processed/golden-set-metadata.json";

const SAMPLE_SIZE = 200;
const SEED = 42;

function seededRandom(seed) {
    let value = seed;

    return function () {
        value = (value * 1664525 + 1013904223) % 4294967296;
        return value / 4294967296;
    };
}

async function readCases() {
    const fileStream = fs.createReadStream(inputPath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const cases = [];

    for await (const line of rl) {
        if (!line.trim()) continue;

        cases.push(JSON.parse(line));
    }

    return cases;
}

function sampleCases(cases) {
    const random = seededRandom(SEED);

    const shuffled = [...cases];

    // Fisher-Yates shuffle using deterministic random numbers.
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));

        [shuffled[i], shuffled[j]] =
            [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, SAMPLE_SIZE);
}

async function createGoldenSet() {
    console.log("\n================================");
    console.log("GOLDEN SET CREATION");
    console.log("================================\n");

    const cases = await readCases();

    console.log(`Cases available: ${cases.length}`);

    if (cases.length < SAMPLE_SIZE) {
        throw new Error(
            `Need at least ${SAMPLE_SIZE} cases, found ${cases.length}`
        );
    }

    const sampledCases = sampleCases(cases);

    const goldenCases = sampledCases.map((item, index) => ({
        caseId: `golden-${String(index + 1).padStart(3, "0")}`,
        conversationId: item.conversationId,
        currentMessageId: item.currentMessageId,
        currentMessage: item.currentMessage,
        context: item.context,
        historicalResponse: item.historicalResponse,
        goldIntent: null
    }));

    const output = goldenCases
        .map((item) => JSON.stringify(item))
        .join("\n") + "\n";

    fs.writeFileSync(outputPath, output);

    const metadata = {
        version: "1.0",
        sampleSize: SAMPLE_SIZE,
        sourceCases: cases.length,
        seed: SEED,
        samplingMethod:
            "Deterministic uniform random sample using Fisher-Yates shuffle with a fixed seed.",
        labelingMethod:
            "Each case will be manually assigned one intent from the approved AmazonHelp taxonomy.",
        purpose:
            "Held-out golden evaluation set for measuring intent classification and downstream system quality.",
        generatedAt: new Date().toISOString()
    };

    fs.writeFileSync(
        metadataPath,
        JSON.stringify(metadata, null, 2) + "\n"
    );

    console.log(`Golden cases written: ${goldenCases.length}`);
    console.log(`Output: ${outputPath}`);
    console.log(`Metadata: ${metadataPath}`);
    console.log(`Seed: ${SEED}`);
}

createGoldenSet().catch((error) => {
    console.error("Golden set creation failed:", error);
    process.exit(1);
});