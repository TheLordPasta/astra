import { callMushMush } from "./mushMushPhone.js";
import { prisma } from "../db/client.js";

async function main() {
  console.log("1. Creating test customer...");

  const customer = await prisma.customer.create({
    data: {
      name: "Sarah Cohen",
      email: "sarah@example.com",
      city: "Tel Aviv",
    },
  });

  console.log("Customer ID:", customer.id);

  try {
    console.log("\n2. Interaction #1");

    await callMushMush(
      `Customer ID ${customer.id} says:
      "I don't like fabrics that are too sheer. I prefer more coverage."
      
      Record an evidence-based customer observation about this preference.
      Do not infer religion, ethnicity, or any other sensitive personal attribute.
      Use the customer observation tool.`,
    );

    console.log("\n3. Interaction #2");

    await callMushMush(
      `Customer ID ${customer.id} says:
      "For the bridal dress, I want something elegant but definitely not transparent."
      
      Retrieve relevant existing observations first.
      Then record this new evidence as a customer observation.
      Do not infer religion, ethnicity, or any other sensitive personal attribute.`,
    );

    console.log("\n4. Interaction #3");

    await callMushMush(
      `Customer ID ${customer.id} says:
      "The last lace we looked at was still too transparent. Show me something more covered."
      
      Retrieve the customer's existing observations.
      Record this new evidence if appropriate.
      Then briefly tell me what preference pattern is becoming apparent.
      Do not infer religion, ethnicity, or any other sensitive personal attribute.`,
    );

    console.log("\n5. Asking Mush Mush what he has learned...");

    const answer = await callMushMush(
      `Customer ID ${customer.id}.
      
      Retrieve this customer's observations.
      Based only on the accumulated evidence, explain what you currently
      understand about this customer's fabric preferences.
      
      Distinguish between:
      - what was directly observed
      - the stronger pattern that appears to be developing
      
      Do not infer religion, ethnicity, or other sensitive personal attributes.
      Keep the answer natural and conversational.`,
    );

    console.log("\nMUSH MUSH:");
    console.log(answer);

    const observations = await prisma.customerObservation.findMany({
      where: {
        customerId: customer.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log("\nDATABASE OBSERVATIONS:");
    console.log(observations);
  } finally {
    await prisma.customerObservation.deleteMany({
      where: {
        customerId: customer.id,
      },
    });

    await prisma.customer.delete({
      where: {
        id: customer.id,
      },
    });

    console.log("\nTest data deleted.");
  }
}

main()
  .catch((error) => {
    console.error("Test failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
