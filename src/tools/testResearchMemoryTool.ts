import { executeResearchMemoryTool } from "./researchMemoryTool.js";

async function main() {
  const result = await executeResearchMemoryTool(
    JSON.stringify({
      market: "Israeli bridal",
      segment: "Bridal designers",
      category: "Lace in bridal clothing",
      geography: "Israel",
      type: "trend",
      subject: null,
      minConfidence: 0.7,
      limit: 10,
    }),
  );

  console.log(result);
}

main().catch((error) => {
  console.error("Research memory tool test failed:", error);

  process.exit(1);
});
