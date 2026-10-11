import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListAdminOrdersQueryParams,
  ListAdminOrdersResponse,
  UpdateAdminOrderStatusBody,
  UpdateAdminOrderStatusParams,
  UpdateAdminOrderStatusResponse,
} from "@workspace/api-zod";
import {
  db,
  orderItemsTable,
  ordersTable,
  type CafeOrder,
  type CafeOrderItem,
} from "@workspace/db";
import { requireCafeAdmin } from "../lib/cafe-auth";

const router: IRouter = Router();

class OrderStatusError extends Error {}

const allowedNextStatus: Record<CafeOrder["status"], CafeOrder["status"][]> = {
  received: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function toAdminOrder(order: CafeOrder, items: CafeOrderItem[]) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    currency: "TRY",
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      baseUnitPriceCents: item.baseUnitPriceCents,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      options: item.optionsSnapshot,
    })),
    createdAt: order.createdAt.toISOString(),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    notes: order.notes,
  };
}

router.get(
  "/admin/orders",
  requireCafeAdmin,
  async (req, res): Promise<void> => {
    const parsed = ListAdminOrdersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const filters = parsed.data.status
      ? [eq(ordersTable.status, parsed.data.status)]
      : [];
    const orders = await db
      .select()
      .from(ordersTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(ordersTable.createdAt))
      .limit(parsed.data.limit);
    const orderIds = orders.map((order) => order.id);
    const items =
      orderIds.length === 0
        ? []
        : await db
            .select()
            .from(orderItemsTable)
            .where(inArray(orderItemsTable.orderId, orderIds));
    const itemsByOrder = new Map<string, CafeOrderItem[]>();
    for (const item of items) {
      const existing = itemsByOrder.get(item.orderId) ?? [];
      existing.push(item);
      itemsByOrder.set(item.orderId, existing);
    }

    res.json(
      ListAdminOrdersResponse.parse({
        orders: orders.map((order) =>
          toAdminOrder(order, itemsByOrder.get(order.id) ?? []),
        ),
      }),
    );
  },
);

router.patch(
  "/admin/orders/:orderId/status",
  requireCafeAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminOrderStatusParams.safeParse(req.params);
    const parsed = UpdateAdminOrderStatusBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: params.success ? parsed.error.message : params.error.message,
      });
      return;
    }

    try {
      const order = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, params.data.orderId))
          .for("update");
        if (!current) {
          const error = new Error("Sipariş bulunamadı.") as OrderStatusError & {
            statusCode: number;
          };
          error.statusCode = 404;
          throw error;
        }
        if (
          !allowedNextStatus[current.status].includes(parsed.data.status) &&
          current.status !== parsed.data.status
        ) {
          throw new OrderStatusError(
            "Bu sipariş durumu değişikliği geçerli değil.",
          );
        }

        if (current.status === parsed.data.status) return current;
        const [updated] = await tx
          .update(ordersTable)
          .set({
            status: parsed.data.status,
            updatedAt: new Date(
              Math.max(Date.now(), current.updatedAt.getTime() + 1),
            ),
          })
          .where(eq(ordersTable.id, current.id))
          .returning();
        if (!updated) throw new Error("Sipariş durumu güncellenemedi.");
        return updated;
      });
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));
      res.json(
        UpdateAdminOrderStatusResponse.parse(toAdminOrder(order, items)),
      );
    } catch (error) {
      if (error instanceof OrderStatusError) {
        const statusCode =
          "statusCode" in error && typeof error.statusCode === "number"
            ? error.statusCode
            : 400;
        res.status(statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

export default router;
