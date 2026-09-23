import "dotenv/config";

import { askMushMush } from "./mushMush.js";

async function main() {
  const response = await askMushMush(
    "What have you learned about lace usage among Israeli bridal designers recently? Use your stored research memory if you have relevant information.",
  );

  console.log("\n==============================");
  console.log("MUSH MUSH RESEARCH MEMORY TEST");
  console.log("==============================\n");
  console.log(response);
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
