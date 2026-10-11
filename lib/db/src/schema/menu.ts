import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pricingModelEnum = pgEnum("pricing_model", [
  "free",
  "per_selection",
  "per_unit",
  "price_delta",
]);

export const productsTable = pgTable(
  "menu_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    basePriceCents: integer("base_price_cents"),
    campaignPriceCents: integer("campaign_price_cents"),
    campaignStartsAt: timestamp("campaign_starts_at", { withTimezone: true }),
    campaignEndsAt: timestamp("campaign_ends_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "menu_products_base_price_nonnegative",
      sql`${table.basePriceCents} is null or ${table.basePriceCents} >= 0`,
    ),
    check(
      "menu_products_campaign_price_valid",
      sql`${table.campaignPriceCents} is null or (${table.basePriceCents} is not null and ${table.campaignPriceCents} >= 0 and ${table.campaignPriceCents} < ${table.basePriceCents})`,
    ),
    check(
      "menu_products_active_requires_price",
      sql`not ${table.isActive} or ${table.basePriceCents} is not null`,
    ),
    check(
      "menu_products_campaign_window_valid",
      sql`${table.campaignStartsAt} is null or ${table.campaignEndsAt} is null or ${table.campaignStartsAt} < ${table.campaignEndsAt}`,
    ),
  ],
);

export const menuOptionsTable = pgTable(
  "menu_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    group: text("option_group").notNull(),
    name: text("name").notNull(),
    priceCents: integer("price_cents"),
    pricingModel: pricingModelEnum("pricing_model")
      .notNull()
      .default("per_selection"),
    isActive: boolean("is_active").notNull().default(false),
    maxQuantity: integer("max_quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("menu_options_product_group_name_unique").on(
      table.productId,
      table.group,
      table.name,
    ),
    check(
      "menu_options_price_nonnegative",
      sql`${table.priceCents} is null or ${table.priceCents} >= 0`,
    ),
    check(
      "menu_options_free_price_zero",
      sql`${table.pricingModel} <> 'free' or ${table.priceCents} = 0`,
    ),
    check(
      "menu_options_paid_price_positive",
      sql`${table.pricingModel} = 'free' or ${table.priceCents} is null or ${table.priceCents} > 0`,
    ),
    check(
      "menu_options_active_requires_price",
      sql`not ${table.isActive} or (${table.priceCents} is not null and ${table.archivedAt} is null)`,
    ),
    check("menu_options_max_quantity_positive", sql`${table.maxQuantity} > 0`),
  ],
);

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const insertMenuOptionSchema = createInsertSchema(menuOptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMenuOption = z.infer<typeof insertMenuOptionSchema>;
export type MenuOption = typeof menuOptionsTable.$inferSelect;
