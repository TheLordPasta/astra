import { customerTools } from "./customers.js";
import { wishlistTools } from "./wishlist.js";
import { fabricTools } from "./fabrics.js";
import { designerTools } from "./designers.js";
import { orderTools } from "./orders.js";
import { conversationTools } from "./conversations.js";
import { competitorTools } from "./competitors.js";
import { trendTools } from "./trends.js";
import { opportunityTools } from "./opportunities.js";

export const tools = {
  ...customerTools,
  ...wishlistTools,
  ...fabricTools,
  ...designerTools,
  ...orderTools,
  ...conversationTools,
  ...competitorTools,
  ...trendTools,
  ...opportunityTools,
};
