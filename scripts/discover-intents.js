import fs from "fs";
import readline from "readline";

const filePath = "processed/amazonhelp-intent-cases.jsonl";

const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on",
    "for", "is", "it", "this", "that", "my", "me", "i", "you",
    "we", "they", "your", "with", "have", "has", "had", "was",
    "were", "are", "be", "been", "am", "do", "does", "did",
    "can", "could", "would", "should", "will", "just", "not",
    "no", "so", "if", "from", "at", "as", "about", "what",
    "why", "how", "when", "where", "please", "amazon",
    "https", "http", "www"
]);

function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, "")
        .replace(/@\w+/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
            (word) =>
                word.length >= 3 &&
                !STOP_WORDS.has(word)
        );
}

async function discoverIntents() {
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const wordCounts = new Map();
    const wordExamples = new Map();

    let totalCases = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        const item = JSON.parse(line);
        const message = item.currentMessage || "";

        totalCases++;

        const words = tokenize(message);

        const uniqueWords = new Set(words);

        for (const word of uniqueWords) {
            wordCounts.set(
                word,
                (wordCounts.get(word) || 0) + 1
            );

            if (!wordExamples.has(word)) {
                wordExamples.set(word, []);
            }

            const examples = wordExamples.get(word);

            if (examples.length < 3) {
                examples.push(message);
            }
        }
    }

    const rankedWords = [...wordCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

    console.log("\n================================");
    console.log("INTENT DISCOVERY");
    console.log("================================\n");

    console.log(`Cases analyzed: ${totalCases}`);

    console.log("\nTop recurring terms:\n");

    rankedWords.forEach(([word, count], index) => {
        console.log(
            `${index + 1}. ${word} — ${count} cases`
        );
    });

    console.log("\n================================");
    console.log("REPRESENTATIVE EXAMPLES");
    console.log("================================\n");

    rankedWords.slice(0, 20).forEach(([word, count]) => {
        console.log(`\n--- ${word} (${count} cases) ---`);

        const examples = wordExamples.get(word) || [];

        examples.forEach((example) => {
            console.log(`• ${example}`);
        });
    });
}

discoverIntents().catch((error) => {
    console.error("Intent discovery failed:", error);
    process.exit(1);
});