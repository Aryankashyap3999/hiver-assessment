import fs from "fs";
import readline from "readline";

const INPUT_FILE =
    "processed/amazonhelp-conversations.jsonl";

const OUTPUT_FILE =
    "processed/amazonhelp-intent-cases.jsonl";

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

function isMeaningfulCustomerMessage(text) {
    const cleaned = text
        .replace(/\s+/g, " ")
        .trim();

    if (!cleaned) {
        return false;
    }

    return !acknowledgementPatterns.some(
        (pattern) => pattern.test(cleaned)
    );
}

function loadConversation(line) {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
}

function extractIntentCases(conversation) {
    const cases = [];

    const messages = conversation.messages;

    for (let i = 0; i < messages.length; i++) {
        const currentMessage = messages[i];

        if (currentMessage.role !== "customer") {
            continue;
        }

        if (
            !isMeaningfulCustomerMessage(
                currentMessage.text
            )
        ) {
            continue;
        }

        const directResponses = messages.filter(
            (message) =>
                message.role === "support" &&
                message.inResponseTo ===
                    currentMessage.tweetId
        );

        if (directResponses.length === 0) {
            continue;
        }

        const context = messages
            .slice(0, i)
            .map((message) => ({
                role: message.role,
                text: message.text,
                createdAt: message.createdAt
            }));

        for (const response of directResponses) {
            cases.push({
                conversationId:
                    conversation.conversationId,

                currentMessageId:
                    currentMessage.tweetId,

                currentMessage:
                    currentMessage.text,

                context,

                historicalResponse: {
                    messageId: response.tweetId,
                    text: response.text
                }
            });
        }
    }

    return cases;
}

async function main() {
    const input = fs.createReadStream(INPUT_FILE);

    const reader = readline.createInterface({
        input,
        crlfDelay: Infinity
    });

    const output = fs.createWriteStream(
        OUTPUT_FILE
    );

    let conversationsRead = 0;
    let casesWritten = 0;

    for await (const line of reader) {
        if (!line.trim()) {
            continue;
        }

        const conversation =
            loadConversation(line);

        if (!conversation) {
            continue;
        }

        conversationsRead++;

        const cases =
            extractIntentCases(conversation);

        for (const intentCase of cases) {
            output.write(
                JSON.stringify(intentCase) + "\n"
            );

            casesWritten++;
        }
    }

    output.end();

    console.log("\n================================");
    console.log("INTENT CASE PREPARATION");
    console.log("================================");

    console.log(
        `Conversations read: ${conversationsRead}`
    );

    console.log(
        `Intent cases written: ${casesWritten}`
    );

    console.log(
        `Output: ${OUTPUT_FILE}`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});