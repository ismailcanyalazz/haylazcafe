import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./menu";

export const orderStatusEnum = pgEnum("order_status", [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

export const orderFulfillmentEnum = pgEnum("order_fulfillment", [
  "pickup",
  "dine_in",
]);

export type PersistedOrderOption = {
  id: string;
  name: string;
  group: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export const ordersTable = pgTable("cafe_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: serial("order_number").notNull().unique(),
  idempotencyKey: uuid("idempotency_key").notNull().unique(),
  requestFingerprint: text("request_fingerprint").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  fulfillmentType: orderFulfillmentEnum("fulfillment_type").notNull(),
  notes: text("notes"),
  status: orderStatusEnum("status").notNull().default("received"),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const orderItemsTable = pgTable("cafe_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => productsTable.id, {
    onDelete: "set null",
  }),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  quantity: integer("quantity").notNull(),
  baseUnitPriceCents: integer("base_unit_price_cents").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  lineTotalCents: integer("line_total_cents").notNull(),
  optionsSnapshot: jsonb("options_snapshot")
    .$type<PersistedOrderOption[]>()
    .notNull()
    .default([]),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type CafeOrder = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({
  id: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type CafeOrderItem = typeof orderItemsTable.$inferSelect;
