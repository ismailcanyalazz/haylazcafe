import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const priceEntityTypeEnum = pgEnum("price_entity_type", [
  "product",
  "option",
]);

export const priceFieldEnum = pgEnum("price_field", [
  "base_price",
  "campaign_price",
  "option_price",
]);

export const priceHistoryTable = pgTable("price_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemType: priceEntityTypeEnum("item_type").notNull(),
  priceField: priceFieldEnum("price_field").notNull(),
  itemId: uuid("item_id").notNull(),
  itemNameSnapshot: text("item_name_snapshot").notNull(),
  previousPriceCents: integer("previous_price_cents"),
  newPriceCents: integer("new_price_cents"),
  changedByUserId: text("changed_by_user_id").notNull(),
  changedByEmail: text("changed_by_email").notNull(),
  changeNote: text("change_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPriceHistorySchema = createInsertSchema(priceHistoryTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type PriceHistory = typeof priceHistoryTable.$inferSelect;
