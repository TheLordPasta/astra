import "dotenv/config";

import { prisma } from "../db/client.js";

async function main() {
  const proposals = await prisma.classroomCodeProposal.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
  });

  if (proposals.length === 0) {
    console.log("No Classroom code proposals were saved.");
    return;
  }

  for (const proposal of proposals) {
    console.log("\n========================================");
    console.log(`PROPOSAL #${proposal.id}`);
    console.log("========================================\n");

    console.log("Title:", proposal.title);
    console.log("File:", proposal.filePath);
    console.log("Status:", proposal.status);
    console.log("Created:", proposal.createdAt.toISOString());

    console.log("\n--- RATIONALE ---\n");
    console.log(proposal.rationale);

    console.log("\n--- DIFF ---\n");
    console.log(proposal.diff ?? "(no diff)");

    console.log("\n--- PROPOSED CODE ---\n");
    console.log(proposal.proposedCode ?? "(no proposed code)");
  }
}

main()
  .catch((error) => {
    console.error("Failed to retrieve proposals:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
