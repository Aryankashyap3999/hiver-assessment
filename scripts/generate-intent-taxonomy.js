import fs from "fs";

const taxonomy = {
    version: "1.0",
    brand: "AmazonHelp",

    methodology:
        "Initial intent taxonomy derived from recurring customer-support issues observed in the AmazonHelp conversation sample and refined through manual review of representative examples.",

    intents: [
        {
            name: "Delivery & Tracking",
            description:
                "Problems with shipment status, tracking, delays, delivery attempts, missing deliveries, or orders marked delivered but not received.",
            primaryQuestion:
                "Where is my shipment, when will it arrive, or what went wrong with delivery?"
        },
        {
            name: "Order Issue",
            description:
                "Problems with the order itself that are not primarily about delivery, payment, returns, or the condition of the received item.",
            primaryQuestion:
                "What is wrong with the order itself?"
        },
        {
            name: "Item Problem",
            description:
                "Problems with the physical product received, including damaged, defective, missing, wrong, or incomplete items.",
            primaryQuestion:
                "What is wrong with the item I received?"
        },
        {
            name: "Returns & Refunds",
            description:
                "Requests or problems involving returning, exchanging, or obtaining a refund for an item.",
            primaryQuestion:
                "Does the customer want to return, exchange, or get money back for an item?"
        },
        {
            name: "Payment & Charges",
            description:
                "Problems involving payments, billing, unexpected charges, duplicate charges, payment methods, or transaction-related issues.",
            primaryQuestion:
                "Is there a problem with a payment or charge?"
        },
        {
            name: "Account & Security",
            description:
                "Problems involving account access, passwords, login, account settings, account closure, verification, or account security.",
            primaryQuestion:
                "Is the customer unable to access, manage, or secure their account?"
        },
        {
            name: "Prime & Subscription",
            description:
                "Problems involving Prime membership, subscriptions, membership renewal or cancellation, or Prime-specific benefits.",
            primaryQuestion:
                "Is the problem specifically about Prime or a subscription?"
        },
        {
            name: "Product & Digital Services",
            description:
                "Problems or questions involving Amazon devices, apps, Prime Video, Fire TV, Alexa, Kindle, or other digital services.",
            primaryQuestion:
                "Is the customer asking about or having trouble with an Amazon product, device, app, or digital service?"
        },
        {
            name: "Seller & Marketplace",
            description:
                "Problems involving third-party sellers, marketplace transactions, seller communication, seller responsibility, or marketplace-specific issues.",
            primaryQuestion:
                "Is the problem primarily caused by or involving a third-party seller or marketplace transaction?"
        },
        {
            name: "OTHER / UNCLEAR",
            description:
                "Messages that do not contain enough information to reliably assign an intent, acknowledgements, general feedback, or issues outside the defined categories.",
            primaryQuestion:
                "Is there insufficient information or no suitable defined intent?"
        }
    ]
};

const outputPath = "processed/intent-taxonomy.json";

fs.writeFileSync(
    outputPath,
    JSON.stringify(taxonomy, null, 2) + "\n"
);

console.log("================================");
console.log("INTENT TAXONOMY GENERATED");
console.log("================================\n");

console.log(`Brand: ${taxonomy.brand}`);
console.log(`Intents: ${taxonomy.intents.length}`);
console.log(`Output: ${outputPath}`);