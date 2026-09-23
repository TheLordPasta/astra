import { callMushMushWithImage } from "./mushMushPhone.js";

async function main() {
  console.log("1. Image test started");

  const imageUrl =
    "https://mazaltov.walla.co.il/uploadimages/template2015/217/gallery_7.jpg";

  const answer = await callMushMushWithImage(
    "היי, אני מחפשת תחרה כזאת לשמלת כלה. " +
      "אני ממש רוצה את המראה הזה, אבל חשוב לי שהיא לא תהיה שקופה מדי. " +
      "יש לכם משהו שיכול להתאים?",
    imageUrl,
  );

  console.log("\nMUSH MUSH EYES:");
  console.log(answer);
}

main().catch((error) => {
  console.error("Image test failed:");
  console.error(error);
  process.exit(1);
});
