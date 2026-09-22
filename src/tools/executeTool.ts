import { getCustomerById } from "../db/customers.js";
import { getCustomerByIdSchema } from "./aiTools.js";

export async function executeTool(
  name: string,
  rawArguments: string,
): Promise<string> {
  switch (name) {
    case "get_customer_by_id": {
      const parsed = getCustomerByIdSchema.safeParse(JSON.parse(rawArguments));

      if (!parsed.success) {
        return JSON.stringify({
          error: "Invalid arguments",
          details: parsed.error.flatten(),
        });
      }

      const customer = await getCustomerById(parsed.data.id);

      return JSON.stringify(customer);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
