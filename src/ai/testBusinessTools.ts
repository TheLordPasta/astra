import { callMushMush } from "./mushMushPhone.js";

async function main() {
  console.log("Business tools test started");

  const answer = await callMushMush(
    "I want to research Classic Textile's business data. " +
      "Use the available tools to: " +
      "1) search the fabric catalog for lace, " +
      "2) search stored competitors for bridal fashion, and " +
      "3) search stored trends for lace. " +
      "Tell me what you find. If a category has no stored data, say so.",
  );

  console.log("\nMUSH MUSH:");
  console.log(answer);
}

main().catch((error) => {
  console.error("Business tools test failed:");
  console.error(error);
  process.exit(1);
});
