import { callMushMush } from "../ai/mushMushPhone.js";

import {
  getCustomerByInstagramUserId,
  createInstagramCustomer,
} from "../db/customers.js";

import {
  getConversationByPlatformExternalId,
  createChannelConversation,
  getConversationMessageByExternalId,
  addConversationMessage,
  getConversationMessages,
} from "../db/conversations.js";

import { sendInstagramMessage } from "./instagramClient.js";

interface InstagramMessage {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  [key: string]: unknown;
}

interface InstagramMessagingEvent {
  sender?: {
    id?: string;
  };
  recipient?: {
    id?: string;
  };
  timestamp?: number;
  message?: InstagramMessage;
  read?: {
    mid?: string;
  };
  [key: string]: unknown;
}

interface InstagramEntry {
  id?: string;
  time?: number;
  messaging?: InstagramMessagingEvent[];
  [key: string]: unknown;
}

interface InstagramWebhookPayload {
  object?: string;
  entry?: InstagramEntry[];
  [key: string]: unknown;
}

const messageQueues = new Map<string, Promise<void>>();

function enqueueMessage(senderId: string, task: () => Promise<void>): void {
  const previous = messageQueues.get(senderId) ?? Promise.resolve();

  const current = previous.catch(() => undefined).then(task);

  messageQueues.set(senderId, current);

  void current.finally(() => {
    if (messageQueues.get(senderId) === current) {
      messageQueues.delete(senderId);
    }
  });
}

function isInstagramWebhookPayload(
  payload: unknown,
): payload is InstagramWebhookPayload {
  return typeof payload === "object" && payload !== null && "entry" in payload;
}

async function processInstagramMessage(
  senderId: string,
  messageId: string,
  text: string,
): Promise<void> {
  console.log("\n=== INSTAGRAM MESSAGE PROCESSING ===");
  console.log("Sender:", senderId);
  console.log("Message ID:", messageId);
  console.log("Message:", text);

  // Prevent duplicate Meta webhook deliveries.
  const existingMessage = await getConversationMessageByExternalId(messageId);

  if (existingMessage) {
    console.log("Duplicate message ignored:", messageId);
    return;
  }

  // Find or create customer.
  let customer = await getCustomerByInstagramUserId(senderId);

  if (!customer) {
    customer = await createInstagramCustomer(senderId);

    console.log("Created Instagram customer:", customer.id);
  } else {
    console.log("Existing Instagram customer:", customer.id);
  }

  // Find or create conversation.
  let conversation = await getConversationByPlatformExternalId(
    "instagram",
    senderId,
  );

  if (!conversation) {
    conversation = await createChannelConversation(
      customer.id,
      "instagram",
      senderId,
    );

    console.log("Created Instagram conversation:", conversation.id);
  } else {
    console.log("Existing Instagram conversation:", conversation.id);
  }

  // Save the customer's message.
  await addConversationMessage({
    conversationId: conversation.id,
    role: "user",
    content: text,
    externalMessageId: messageId,
  });

  console.log("Customer message saved.");

  // Load conversation memory.
  const history = await getConversationMessages(conversation.id);

  const conversationContext = history
    .map((item) => {
      const role = item.role === "assistant" ? "Mush Mush" : "Customer";

      return `${role}: ${item.content ?? ""}`;
    })
    .join("\n");

  const mushMushInput = `
You are replying to a customer on Instagram.

Use this conversation history as memory:

${conversationContext}

Reply naturally to the customer's latest message.
`.trim();

  const mushMushReply = await callMushMush(mushMushInput);

  console.log("\n=== MUSH MUSH REPLY ===");
  console.log(mushMushReply);

  // Send reply to Instagram.
  const sendResult = await sendInstagramMessage(senderId, mushMushReply);

  // Save Mush Mush's reply.
  await addConversationMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: mushMushReply,
    externalMessageId: sendResult.message_id,
  });

  console.log("\n=== INSTAGRAM REPLY SENT ===");
  console.log(JSON.stringify(sendResult, null, 2));
}

export async function handleInstagramWebhook(payload: unknown): Promise<void> {
  if (!isInstagramWebhookPayload(payload)) {
    console.warn("Invalid Instagram webhook payload.");
    return;
  }

  if (payload.object !== "instagram") {
    console.log("Ignoring non-Instagram webhook event.");
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const message = event.message;

      if (!senderId) {
        continue;
      }

      // Ignore read receipts.
      if (event.read) {
        console.log("Ignoring Instagram read receipt.");
        continue;
      }

      // Ignore events without a message.
      if (!message) {
        continue;
      }

      // Ignore our own messages.
      if (message.is_echo === true) {
        continue;
      }

      const text = message.text?.trim();
      const messageId = message.mid;

      if (!text || !messageId) {
        console.log("Ignoring Instagram event without text or message ID.");
        continue;
      }

      enqueueMessage(senderId, async () => {
        await processInstagramMessage(senderId, messageId, text);
      });
    }
  }
}
