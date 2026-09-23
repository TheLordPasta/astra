import { runMarketResearch } from "./mushMushResearch.js";
import { saveResearchReport } from "./researchMemory.js";
import { getResearchJobById } from "../db/research.js";

async function main() {
  console.log("=== MUSH MUSH EXPERIENCE MEMORY TEST ===\n");

  const report = await runMarketResearch(
    `
Research Israeli bridal designers who recently used lace.

Focus only on:
- Israel
- bridal designers
- lace
- last 90 days

Find up to 5 relevant designers.

For each one, identify:
- designer
- recent lace evidence
- source
- useful engagement metrics if available

Then identify up to 3 repeated patterns.

Do not research general fashion, Europe, pricing,
or unrelated categories.
  `.trim(),
  );

  console.log("\n=== RESEARCH COMPLETE ===");

  const researchJobId = await saveResearchReport(report);

  console.log("\nSaved Research Job:", researchJobId);

  const saved = await getResearchJobById(researchJobId);

  console.log("\n=== STORED EXPERIENCE ===");

  console.log(JSON.stringify(saved, null, 2));
}

main().catch((error) => {
  console.error("Experience memory test failed:");
  console.error(error);
  process.exit(1);
});
