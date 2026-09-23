import { getCustomerById } from "../db/customers.js";

import { getCustomerWishlist, addWishlistItem } from "../db/wishlist.js";

import {
  getCustomerObservations,
  addCustomerObservation,
} from "../db/customerObservations.js";

import {
  getCustomerConversations,
  addConversationMessage,
} from "../db/conversations.js";

import {
  getOrderById,
  getCustomerOrders,
  getRecentOrders,
} from "../db/orders.js";

import { getDesignerById, searchDesigners } from "../db/designers.js";

import {
  getFabricById,
  searchFabrics,
  getAvailableFabrics,
} from "../db/fabrics.js";

import {
  getOpportunityById,
  getOpenOpportunities,
  searchOpportunities,
} from "../db/opportunities.js";

import {
  getCompetitorById,
  searchCompetitors,
  getAllCompetitors,
} from "../db/competitors.js";

import { getTrendById, searchTrends } from "../db/trends.js";

import {
  getCustomerByIdSchema,
  getCustomerWishlistSchema,
  addWishlistItemSchema,
  getCustomerObservationsSchema,
  addCustomerObservationSchema,
  getCustomerConversationsSchema,
  addConversationMessageSchema,
  getOrderByIdSchema,
  getCustomerOrdersSchema,
  getDesignerByIdSchema,
  searchSchema,
  getFabricByIdSchema,
  getOpportunityByIdSchema,
  getCompetitorByIdSchema,
  getTrendByIdSchema,
} from "./aiTools.js";

function invalidArguments(error: unknown): string {
  return JSON.stringify({
    error: "Invalid arguments",
    details: error,
  });
}

export async function executeTool(
  name: string,
  rawArguments: string,
): Promise<string> {
  try {
    const args: unknown = JSON.parse(rawArguments);

    switch (name) {
      // -------------------------
      // CUSTOMERS
      // -------------------------

      case "get_customer_by_id": {
        const parsed = getCustomerByIdSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const customer = await getCustomerById(parsed.data.id);

        return JSON.stringify(customer);
      }

      // -------------------------
      // WISHLIST
      // -------------------------

      case "get_customer_wishlist": {
        const parsed = getCustomerWishlistSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const wishlist = await getCustomerWishlist(parsed.data.customerId);

        return JSON.stringify(wishlist);
      }

      case "add_wishlist_item": {
        const parsed = addWishlistItemSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const wishlistItem = await addWishlistItem(parsed.data);

        return JSON.stringify(wishlistItem);
      }

      // -------------------------
      // CUSTOMER OBSERVATIONS
      // -------------------------

      case "get_customer_observations": {
        const parsed = getCustomerObservationsSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const observations = await getCustomerObservations(
          parsed.data.customerId,
        );

        return JSON.stringify(observations);
      }

      case "add_customer_observation": {
        const parsed = addCustomerObservationSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const observation = await addCustomerObservation(parsed.data);

        return JSON.stringify(observation);
      }

      // -------------------------
      // CONVERSATIONS
      // -------------------------

      case "get_customer_conversations": {
        const parsed = getCustomerConversationsSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const conversations = await getCustomerConversations(
          parsed.data.customerId,
        );

        return JSON.stringify(conversations);
      }

      case "add_conversation_message": {
        const parsed = addConversationMessageSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const message = await addConversationMessage(parsed.data);

        return JSON.stringify(message);
      }

      // -------------------------
      // ORDERS
      // -------------------------

      case "get_order_by_id": {
        const parsed = getOrderByIdSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const order = await getOrderById(parsed.data.id);

        return JSON.stringify(order);
      }

      case "get_customer_orders": {
        const parsed = getCustomerOrdersSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const orders = await getCustomerOrders(parsed.data.customerId);

        return JSON.stringify(orders);
      }

      case "get_recent_orders": {
        const orders = await getRecentOrders();

        return JSON.stringify(orders);
      }

      // -------------------------
      // DESIGNERS
      // -------------------------

      case "get_designer_by_id": {
        const parsed = getDesignerByIdSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const designer = await getDesignerById(parsed.data.id);

        return JSON.stringify(designer);
      }

      case "search_designers": {
        const parsed = searchSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const designers = await searchDesigners(parsed.data.query);

        return JSON.stringify(designers);
      }

      // -------------------------
      // FABRICS
      // -------------------------

      case "get_fabric_by_id": {
        const parsed = getFabricByIdSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const fabric = await getFabricById(parsed.data.id);

        return JSON.stringify(fabric);
      }

      case "search_fabrics": {
        const parsed = searchSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const fabrics = await searchFabrics(parsed.data.query);

        return JSON.stringify(fabrics);
      }

      case "get_available_fabrics": {
        const fabrics = await getAvailableFabrics();

        return JSON.stringify(fabrics);
      }

      // -------------------------
      // OPPORTUNITIES
      // -------------------------

      case "get_opportunity_by_id": {
        const parsed = getOpportunityByIdSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const opportunity = await getOpportunityById(parsed.data.id);

        return JSON.stringify(opportunity);
      }

      case "get_open_opportunities": {
        const opportunities = await getOpenOpportunities();

        return JSON.stringify(opportunities);
      }

      case "search_opportunities": {
        const parsed = searchSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const opportunities = await searchOpportunities(parsed.data.query);

        return JSON.stringify(opportunities);
      }

      // -------------------------
      // COMPETITORS
      // -------------------------

      case "get_competitor_by_id": {
        const parsed = getCompetitorByIdSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const competitor = await getCompetitorById(parsed.data.id);

        return JSON.stringify(competitor);
      }

      case "search_competitors": {
        const parsed = searchSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const competitors = await searchCompetitors(parsed.data.query);

        return JSON.stringify(competitors);
      }

      case "get_all_competitors": {
        const competitors = await getAllCompetitors();

        return JSON.stringify(competitors);
      }

      // -------------------------
      // TRENDS
      // -------------------------

      case "get_trend_by_id": {
        const parsed = getTrendByIdSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const trend = await getTrendById(parsed.data.id);

        return JSON.stringify(trend);
      }

      case "search_trends": {
        const parsed = searchSchema.safeParse(args);

        if (!parsed.success) {
          return invalidArguments(parsed.error.flatten());
        }

        const trends = await searchTrends(parsed.data.query);

        return JSON.stringify(trends);
      }

      // -------------------------
      // UNKNOWN
      // -------------------------

      default:
        return JSON.stringify({
          error: `Unknown tool: ${name}`,
        });
    }
  } catch (error) {
    return JSON.stringify({
      error:
        error instanceof Error ? error.message : "Unknown tool execution error",
    });
  }
}
