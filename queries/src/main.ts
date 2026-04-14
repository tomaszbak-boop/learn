import { open } from "sqlite";
import sqlite3 from "sqlite3";

import { createSchema } from "./schema";
import { getStalePendingOrders } from "./queries/order_queries";

async function main() {
  const db = await open({
    filename: "ecommerce.db",
    driver: sqlite3.Database,
  });

  await createSchema(db);

  const staleOrders = await getStalePendingOrders(db);

  if (staleOrders.length === 0) {
    console.log("No orders have been pending for more than 3 days.");
  } else {
    console.log(
      `Orders pending for more than 3 days (${staleOrders.length}):\n`,
    );
    for (const order of staleOrders) {
      console.log(
        `  #${order.order_number} — ${order.customer_name} (${order.customer_email})` +
          ` | $${order.total_amount} | ${order.days_pending} days pending since ${order.created_at}`,
      );
    }
  }
}

main();
