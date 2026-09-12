import fs from "fs";
import readline from "readline";

const CORPUS_PATH = "processed/evaluation-corpus.jsonl";
const DEFAULT_TOP_K = 3;

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
    const cleaned = text.replace(/\s+/g, " ").trim();

    if (!cleaned) {
        return false;
    }

    return !acknowledgementPatterns.some((pattern) => pattern.test(cleaned));
}

function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/@\w+/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 1);
}

async function loadRetrievalCases() {
    const cases = [];

    const fileStream = fs.createReadStream(CORPUS_PATH);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;

        const conversation = JSON.parse(line);
        const messages = conversation.messages;

        for (let i = 0; i < messages.length; i++) {
            const currentMessage = messages[i];

            if (currentMessage.role !== "customer") continue;
            if (!isMeaningfulCustomerMessage(currentMessage.text)) continue;

            const directResponse = messages.find(
                (message) =>
                    message.role === "support" &&
                    message.inResponseTo === currentMessage.tweetId
            );

            if (!directResponse) continue;

            const context = messages.slice(0, i).map((message) => ({
                role: message.role,
                text: message.text,
                createdAt: message.createdAt
            }));

            cases.push({
                conversationId: conversation.conversationId,
                currentMessageId: currentMessage.tweetId,
                currentMessage: currentMessage.text,
                context,
                historicalResponse: {
                    messageId: directResponse.tweetId,
                    text: directResponse.text
                }
            });
        }
    }

    return cases;
}

function toWeightedVector(tokens, idf) {
    const termCounts = new Map();

    for (const token of tokens) {
        termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    const vector = new Map();

    for (const [token, count] of termCounts) {
        const tokenIdf = idf.get(token);

        if (tokenIdf) {
            vector.set(token, count * tokenIdf);
        }
    }

    let normSquared = 0;
    for (const weight of vector.values()) {
        normSquared += weight * weight;
    }
    const norm = Math.sqrt(normSquared) || 1;

    for (const [token, weight] of vector) {
        vector.set(token, weight / norm);
    }

    return vector;
}

function buildIndex(cases) {
    const documentFrequency = new Map();
    const tokenizedCases = cases.map((retrievalCase) => {
        const tokens = tokenize(retrievalCase.currentMessage);

        for (const token of new Set(tokens)) {
            documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
        }

        return { retrievalCase, tokens };
    });

    const totalDocuments = cases.length;
    const idf = new Map();

    for (const [token, count] of documentFrequency) {
        idf.set(token, Math.log(totalDocuments / count));
    }

    const vectors = tokenizedCases.map(({ retrievalCase, tokens }) => ({
        retrievalCase,
        vector: toWeightedVector(tokens, idf)
    }));

    return { idf, vectors };
}

function cosineSimilarity(vectorA, vectorB) {
    const [smaller, larger] = vectorA.size <= vectorB.size ? [vectorA, vectorB] : [vectorB, vectorA];

    let similarity = 0;
    for (const [token, weight] of smaller) {
        const otherWeight = larger.get(token);
        if (otherWeight) {
            similarity += weight * otherWeight;
        }
    }

    return similarity;
}

let indexPromise = null;

function getIndex() {
    if (!indexPromise) {
        indexPromise = loadRetrievalCases().then(buildIndex);
    }

    return indexPromise;
}

export async function retrieveSimilarCases(queryText, topK = DEFAULT_TOP_K) {
    const { idf, vectors } = await getIndex();
    const queryVector = toWeightedVector(tokenize(queryText), idf);

    const scored = vectors.map(({ retrievalCase, vector }) => ({
        conversationId: retrievalCase.conversationId,
        messageId: retrievalCase.currentMessageId,
        historicalMessage: retrievalCase.currentMessage,
        context: retrievalCase.context,
        historicalResponse: retrievalCase.historicalResponse,
        score: cosineSimilarity(queryVector, vector)
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).filter((result) => result.score > 0);
}
