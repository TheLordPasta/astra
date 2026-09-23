import { getInstagramProfile } from "./instagramClient.js";

async function main() {
  console.log("Testing Instagram client...");

  const profile = await getInstagramProfile();

  console.log("Instagram connection works:");
  console.log(JSON.stringify(profile, null, 2));
}

main().catch((error) => {
  console.error("Instagram test failed:");
  console.error(error);
  process.exit(1);
});
