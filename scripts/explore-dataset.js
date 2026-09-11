import fs from "fs";
import { parse } from "csv-parse";

const filePath =
    process.argv[2] ||
    "/home/aryankashyap/myworkfolder/dataset/archive/twcs/twcs.csv";

const candidateAccounts = [
    "AmazonHelp",
    "AppleSupport",
    "Uber_Support",
    "SpotifyCares",
    "sprintcare"
];

const tweets = new Map();
const supportAccounts = new Map();
const replies = new Map();

function processTweet(row) {
    const tweet = {
        tweetId: row.tweet_id,
        authorId: row.author_id,
        inbound: row.inbound === "True",
        text: row.text,
        inResponseTo: row.in_response_to_tweet_id
    };

    tweets.set(tweet.tweetId, tweet);

    if (tweet.inResponseTo) {
        if (!replies.has(tweet.inResponseTo)) {
            replies.set(tweet.inResponseTo, []);
        }

        replies.get(tweet.inResponseTo).push(tweet.tweetId);
    }

    if (!tweet.inbound) {
        supportAccounts.set(
            tweet.authorId,
            (supportAccounts.get(tweet.authorId) || 0) + 1
        );
    }
}

function findConversationRoot(tweetId) {
    const visited = new Set();
    let currentTweet = tweets.get(tweetId);

    while (currentTweet?.inResponseTo) {
        if (visited.has(currentTweet.tweetId)) {
            break;
        }

        visited.add(currentTweet.tweetId);

        const parentTweet = tweets.get(currentTweet.inResponseTo);

        if (!parentTweet) {
            break;
        }

        currentTweet = parentTweet;
    }

    return currentTweet?.tweetId;
}

function buildConversation(rootId) {
    const conversation = [];
    const queue = [rootId];
    const visited = new Set();

    while (queue.length > 0) {
        const tweetId = queue.shift();

        if (visited.has(tweetId)) continue;

        visited.add(tweetId);

        const tweet = tweets.get(tweetId);

        if (!tweet) continue;

        conversation.push(tweet);

        const childReplies = replies.get(tweetId) || [];

        for (const childId of childReplies) {
            queue.push(childId);
        }
    }

    return conversation;
}

function collectConversationRoots() {
    const roots = new Map();

    for (const tweet of tweets.values()) {
        const rootId = findConversationRoot(tweet.tweetId);

        if (!rootId) continue;

        if (!roots.has(rootId)) {
            roots.set(rootId, new Set());
        }

        roots.get(rootId).add(tweet.tweetId);
    }

    return roots;
}

function analyzeBrandConversations(supportAccount, conversationRoots) {
    const conversationStats = {
        total: 0,
        multiTurn: 0,
        messageCounts: []
    };

    for (const rootId of conversationRoots.keys()) {
        const conversation = buildConversation(rootId);

        const hasSupportReply = conversation.some(
            (message) =>
                !message.inbound &&
                message.authorId === supportAccount
        );

        if (!hasSupportReply) continue;

        conversationStats.total++;

        const messageCount = conversation.length;

        conversationStats.messageCounts.push(messageCount);

        if (messageCount >= 3) {
            conversationStats.multiTurn++;
        }
    }

    const counts = conversationStats.messageCounts.sort((a, b) => a - b);

    const totalMessages = counts.reduce(
        (sum, count) => sum + count,
        0
    );

    const average =
        counts.length > 0
            ? totalMessages / counts.length
            : 0;

    const median =
        counts.length > 0
            ? counts[Math.floor(counts.length / 2)]
            : 0;

    return {
        supportTweets: supportAccounts.get(supportAccount) || 0,
        conversations: conversationStats.total,
        multiTurn: conversationStats.multiTurn,
        averageMessages: average,
        medianMessages: median
    };
}

function printSupportAccounts() {
    const accounts = [...supportAccounts.entries()]
        .sort((a, b) => b[1] - a[1]);

    console.log("\n================================");
    console.log("SUPPORT ACCOUNT DISCOVERY");
    console.log("================================");

    console.log(`Support accounts found: ${accounts.length}\n`);

    console.log("Top 30 support accounts:\n");

    for (const [account, outboundTweets] of accounts.slice(0, 30)) {
        console.log(`${account}: ${outboundTweets}`);
    }
}

function printBrandAnalysis(results) {
    console.log("\n================================");
    console.log("BRAND CONVERSATION ANALYSIS");
    console.log("================================");

    console.table(results);
}

const parser = fs.createReadStream(filePath).pipe(
    parse({
        columns: true,
        skip_empty_lines: true
    })
);

parser.on("data", processTweet);

parser.on("end", () => {
    console.log(`\nTweets indexed: ${tweets.size}`);
    console.log(`Reply relationships indexed: ${replies.size}`);

    printSupportAccounts();

    console.log("\nBuilding conversation roots...");

    const conversationRoots = collectConversationRoots();

    console.log(
        `Conversation roots discovered: ${conversationRoots.size}`
    );

    const results = candidateAccounts.map((account) => {
        return {
            brand: account,
            ...analyzeBrandConversations(
                account,
                conversationRoots
            )
        };
    });

    printBrandAnalysis(results);
});

parser.on("error", (error) => {
    console.error("Error while reading dataset:", error);
});