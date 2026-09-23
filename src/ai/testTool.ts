import { executeTool } from "../tools/executeTool.js";

async function main() {
  const result = await executeTool(
    "get_customer_by_id",
    JSON.stringify({ id: 1 }),
  );

  console.log("executeTool result:");
  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
