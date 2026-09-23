import { prisma } from "./client.js";

async function main() {
  const observations = await prisma.researchObservation.findMany({
    select: {
      id: true,
      researchJob: {
        select: {
          market: true,
          segment: true,
          category: true,
        },
      },
    },
  });

  let updated = 0;

  for (const observation of observations) {
    const { market, segment, category } = observation.researchJob;

    if (market == null && segment == null && category == null) {
      continue;
    }

    await prisma.researchObservation.update({
      where: {
        id: observation.id,
      },
      data: {
        market,
        segment,
        category,
      },
    });

    updated++;
  }

  console.log(`Backfill complete. Updated ${updated} observations.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
