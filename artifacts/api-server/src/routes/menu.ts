import { createHash } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetPublicMenuResponse,
} from "@workspace/api-zod";
import {
  db,
  menuOptionsTable,
  orderItemsTable,
  ordersTable,
  productsTable,
} from "@workspace/db";
import {
  calculateOrderLine,
  CafePricingError,
  getEffectiveProductPrice,
} from "../lib/cafe-pricing";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();

/**
 * Sipariş uç noktası herkese açık olduğundan kötüye kullanıma karşı
 * IP başına sınırlanır. Normal bir müşteri dakikada birkaç kez sipariş
 * göndermez; aynı siparişin tekrarı zaten idempotency anahtarıyla korunur.
 */
const orderRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: "Çok fazla sipariş denemesi yapıldı. Lütfen bir dakika sonra tekrar deneyin.",
});

function serializeOrderReceipt(
  order: typeof ordersTable.$inferSelect,
  items: (typeof orderItemsTable.$inferSelect)[],
) {
  return CreateOrderResponse.parse({
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
  });
}

router.get("/menu", async (_req, res): Promise<void> => {
  const allProducts = await db
    .select()
    .from(productsTable)
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

  // Fiyatı hiç girilmemiş ürünler müşteriye gösterilmez; yarım görünen bir
  // menü yerine, ürün yönetim panelinde fiyatlanana kadar gizli kalır.
  // Fiyatı olup satışa kapatılanlar "Tükendi" olarak görünmeye devam eder.
  const products = allProducts.filter(
    (product) => getEffectiveProductPrice(product) !== null,
  );
  const productIds = products.map((product) => product.id);
  const options =
    productIds.length === 0
      ? []
      : await db
          .select()
          .from(menuOptionsTable)
          .where(inArray(menuOptionsTable.productId, productIds))
          .orderBy(asc(menuOptionsTable.sortOrder), asc(menuOptionsTable.name));
  const availableOptions = options.filter(
    (option) =>
      option.isActive &&
      option.archivedAt === null &&
      option.priceCents !== null,
  );
  const optionsByProduct = new Map<string, typeof availableOptions>();
  for (const option of availableOptions) {
    const list = optionsByProduct.get(option.productId) ?? [];
    list.push(option);
    optionsByProduct.set(option.productId, list);
  }

  const categories = new Map<
    string,
    { id: string; title: string; products: unknown[] }
  >();
  for (const product of products) {
    const categoryId = product.category.trim().toLocaleLowerCase("tr-TR");
    const category =
      categories.get(categoryId) ??
      {
        id: categoryId,
        title: product.category.trim().replace(
          /^./u,
          (initial) => initial.toLocaleUpperCase("tr-TR"),
        ),
        products: [],
      };
    const pricing = getEffectiveProductPrice(product);
    const isAvailable = product.isActive && pricing !== null;

    category.products.push({
      id: product.id,
      name: product.name,
      category: product.category,
      description: product.description,
      imageUrl: product.imageUrl,
      basePriceCents: product.basePriceCents,
      campaignPriceCents: product.campaignPriceCents,
      priceCents: pricing?.effectivePriceCents ?? null,
      isAvailable,
      unavailableReason: isAvailable ? null : "Şu anda siparişe kapalı.",
      options: (optionsByProduct.get(product.id) ?? []).map((option) => ({
        id: option.id,
        name: option.name,
        group: option.group,
        priceCents: option.priceCents,
        pricingModel: option.pricingModel,
        maxQuantity: option.maxQuantity,
        isAvailable: true,
      })),
    });
    categories.set(categoryId, category);
  }

  // Menü herkese açıktır ve sık değişmez. Kısa süreli önbellek, sayfa açılış
  // hızını (ve dolayısıyla arama sıralamasını) iyileştirir; sipariş tutarı her
  // hâlükârda sunucuda yeniden doğrulandığı için eski fiyat riski yoktur.
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json(
    GetPublicMenuResponse.parse({
      currency: "TRY",
      categories: [...categories.values()],
    }),
  );
});

router.post("/orders", orderRateLimit, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const normalizedName = input.customerName.trim();
  const normalizedPhone = input.customerPhone.trim();
  if (normalizedName.length < 2 || normalizedPhone.length < 7) {
    res.status(400).json({
      error: "Ad ve telefon numarasını kontrol edip yeniden deneyin.",
    });
    return;
  }
  const requestFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        customerName: normalizedName,
        customerPhone: normalizedPhone,
        fulfillmentType: input.fulfillmentType,
        notes: input.notes?.trim() || null,
        quotedTotalCents: input.quotedTotalCents,
        items: input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          options: [...item.options]
            .map(({ optionId, quantity }) => ({ optionId, quantity }))
            .sort((a, b) => a.optionId.localeCompare(b.optionId)),
        })),
      }),
    )
    .digest("hex");
  const existing = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existing[0]) {
    if (existing[0].requestFingerprint !== requestFingerprint) {
      res.status(409).json({
        error: "Bu sipariş anahtarı daha önce farklı bir istekle kullanılmış.",
      });
      return;
    }
    const savedItems = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, existing[0].id));
    res.status(200).json(serializeOrderReceipt(existing[0], savedItems));
    return;
  }

  const allOptionIds = input.items.flatMap((item) =>
    item.options.map((option) => option.optionId),
  );
  if (
    input.items.some(
      (item) =>
        item.options.length > 30 ||
        new Set(item.options.map((option) => option.optionId)).size !==
          item.options.length,
    )
  ) {
    res.status(400).json({
      error: "Aynı sipariş satırında bir seçenek bir kez eklenebilir.",
    });
    return;
  }

  try {
    const receipt = await db.transaction(async (tx) => {
      const productIds = [...new Set(input.items.map((item) => item.productId))];
      const products = await tx
        .select()
        .from(productsTable)
        .where(inArray(productsTable.id, productIds))
        .for("update");
      const productsById = new Map(products.map((product) => [product.id, product]));
      if (productsById.size !== productIds.length) {
        throw new CafePricingError("Menüde bulunmayan bir ürün seçildi.");
      }

      const optionRows =
        allOptionIds.length === 0
          ? []
          : await tx
              .select()
              .from(menuOptionsTable)
              .where(inArray(menuOptionsTable.id, [...new Set(allOptionIds)]))
              .for("update");
      const optionsById = new Map(optionRows.map((option) => [option.id, option]));

      const calculatedLines = input.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new CafePricingError("Menüde bulunmayan bir ürün seçildi.");
        }
        if (!product.isActive) {
          throw new CafePricingError(`${product.name} şu anda siparişe kapalı.`);
        }
        const pricing = getEffectiveProductPrice(product);
        if (!pricing) {
          throw new CafePricingError(`${product.name} için fiyat belirlenmemiş.`);
        }

        const selectedOptions = item.options.map(({ optionId, quantity }) => {
          const option = optionsById.get(optionId);
          if (
            !option ||
            option.productId !== product.id ||
            !option.isActive ||
            option.archivedAt !== null
          ) {
            throw new CafePricingError("Seçeneklerden biri artık siparişe açık değil.");
          }
          return { option, quantity };
        });

        const calculation = calculateOrderLine(
          pricing,
          item.quantity,
          selectedOptions,
        );

        return {
          product,
          quantity: item.quantity,
          calculation,
        };
      });

      const subtotalCents = calculatedLines.reduce(
        (total, line) => total + line.calculation.subtotalCents,
        0,
      );
      const discountCents = calculatedLines.reduce(
        (total, line) => total + line.calculation.discountCents,
        0,
      );
      const totalCents = subtotalCents - discountCents;

      if (input.quotedTotalCents !== totalCents) {
        throw new CafePricingError(
          "Menü fiyatları değişti. Güncel fiyatları kontrol edip siparişi yeniden onaylayın.",
          409,
        );
      }

      const [order] = await tx
        .insert(ordersTable)
        .values({
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          customerName: normalizedName,
          customerPhone: normalizedPhone,
          fulfillmentType: input.fulfillmentType,
          notes: input.notes?.trim() || null,
          subtotalCents,
          discountCents,
          totalCents,
        })
        .returning();
      if (!order) {
        throw new Error("Sipariş kaydı oluşturulamadı.");
      }

      const savedItems = await tx.insert(orderItemsTable).values(
        calculatedLines.map(({ product, quantity, calculation }) => ({
          orderId: order.id,
          productId: product.id,
          productNameSnapshot: product.name,
          quantity,
          baseUnitPriceCents: calculation.baseUnitPriceCents,
          unitPriceCents: calculation.unitPriceCents,
          lineTotalCents: calculation.lineTotalCents,
          optionsSnapshot: calculation.optionsSnapshot,
        })),
      ).returning();

      return serializeOrderReceipt(order, savedItems);
    });

    res.status(201).json(receipt);
  } catch (error) {
    if (error instanceof CafePricingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      const racedOrder = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (racedOrder[0]) {
        if (racedOrder[0].requestFingerprint !== requestFingerprint) {
          res.status(409).json({
            error: "Bu sipariş anahtarı daha önce farklı bir istekle kullanılmış.",
          });
          return;
        }
        const savedItems = await db
          .select()
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, racedOrder[0].id));
        res.status(200).json(serializeOrderReceipt(racedOrder[0], savedItems));
        return;
      }
    }
    throw error;
  }
});

export default router;
