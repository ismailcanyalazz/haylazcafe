import {
  and,
  asc,
  desc,
  eq,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ApplyBulkPricingBody,
  ApplyBulkPricingResponse,
  CreateAdminOptionBody,
  CreateAdminOptionResponse,
  CreateAdminProductBody,
  CreateAdminProductResponse,
  GetAdminAccessResponse,
  ListAdminPricingResponse,
  ListPriceHistoryQueryParams,
  ListPriceHistoryResponse,
  OptionUpdate,
  PreviewBulkPricingBody,
  PreviewBulkPricingResponse,
  UpdateAdminOptionBody,
  UpdateAdminOptionParams,
  UpdateAdminOptionResponse,
  UpdateAdminProductBody,
  UpdateAdminProductParams,
  UpdateAdminProductResponse,
} from "@workspace/api-zod";
import {
  db,
  menuOptionsTable,
  priceHistoryTable,
  productsTable,
} from "@workspace/db";
import {
  adminLabel,
  hasAdminSession,
  requireCafeAdmin,
} from "../lib/cafe-auth";

const router: IRouter = Router();
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AdminErrorStatus = 400 | 404 | 409;

class AdminPricingError extends Error {
  constructor(
    message: string,
    readonly statusCode: AdminErrorStatus,
  ) {
    super(message);
    this.name = "AdminPricingError";
  }
}

/**
 * Fiyat geçmişine yazılacak "kim değiştirdi" alanları.
 *
 * Anahtar adları `priceHistoryTable` sütunlarıyla birebir aynı olmalı:
 * çağrı yerlerinde `...actor` olarak yayıldığı için `userId`/`email` gibi
 * farklı adlar sessizce eksik sütuna yol açardı.
 */
function actorFromResponse(res: Parameters<typeof requireCafeAdmin>[1]) {
  return {
    changedByUserId: String(res.locals.cafeAdminUserId),
    changedByEmail: String(res.locals.cafeAdminEmail),
  };
}

function toAdminProduct(product: typeof productsTable.$inferSelect) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    description: product.description,
    imageUrl: product.imageUrl,
    basePriceCents: product.basePriceCents,
    campaignPriceCents: product.campaignPriceCents,
    campaignStartsAt: product.campaignStartsAt?.toISOString() ?? null,
    campaignEndsAt: product.campaignEndsAt?.toISOString() ?? null,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    updatedAt: product.updatedAt.toISOString(),
  };
}

function toAdminOption(
  option: typeof menuOptionsTable.$inferSelect,
  product: typeof productsTable.$inferSelect,
) {
  return {
    id: option.id,
    productId: option.productId,
    productName: product.name,
    category: product.category,
    group: option.group,
    name: option.name,
    priceCents: option.priceCents,
    pricingModel: option.pricingModel,
    isActive: option.isActive,
    maxQuantity: option.maxQuantity,
    sortOrder: option.sortOrder,
    updatedAt: option.updatedAt.toISOString(),
  };
}

function productPricingError(input: {
  basePriceCents: number | null;
  campaignPriceCents: number | null;
  campaignStartsAt: string | null;
  campaignEndsAt: string | null;
  isActive: boolean;
}): string | null {
  if (input.isActive && input.basePriceCents === null) {
    return "Fiyatı belirlenmemiş bir ürün satışa açılamaz.";
  }
  if (
    input.campaignPriceCents !== null &&
    (input.basePriceCents === null ||
      input.campaignPriceCents >= input.basePriceCents)
  ) {
    return "Kampanya fiyatı normal fiyattan düşük olmalıdır.";
  }
  if (
    input.campaignPriceCents === null &&
    (input.campaignStartsAt !== null || input.campaignEndsAt !== null)
  ) {
    return "Kampanya tarihleri girmek için önce kampanya fiyatı belirleyin.";
  }
  if (
    input.campaignStartsAt !== null &&
    input.campaignEndsAt !== null &&
    new Date(input.campaignStartsAt).getTime() >=
      new Date(input.campaignEndsAt).getTime()
  ) {
    return "Kampanya bitiş tarihi başlangıç tarihinden sonra olmalıdır.";
  }
  return null;
}

function optionPricingError(input: {
  priceCents: number | null;
  pricingModel: "free" | "per_selection" | "per_unit" | "price_delta";
  isActive: boolean;
}): string | null {
  if (input.isActive && input.priceCents === null) {
    return "Fiyatı belirlenmemiş bir ek malzeme satışa açılamaz.";
  }
  if (input.pricingModel === "free" && input.priceCents !== 0) {
    return "Ücretsiz seçenek için fiyat açıkça 0 TL olmalıdır.";
  }
  if (
    input.pricingModel !== "free" &&
    input.priceCents !== null &&
    input.priceCents < 1
  ) {
    return "Ücretli seçeneklerin fiyatı 0'dan büyük olmalıdır.";
  }
  return null;
}

function timestampForUpdate(current: Date): Date {
  return new Date(Math.max(Date.now(), current.getTime() + 1));
}

function matchesExpectedVersion(current: Date, expected: string): boolean {
  return current.getTime() === new Date(expected).getTime();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function recordPriceChange(
  tx: DbTransaction,
  entry: {
    itemType: "product" | "option";
    priceField: "base_price" | "campaign_price" | "option_price";
    itemId: string;
    itemNameSnapshot: string;
    previousPriceCents: number | null;
    newPriceCents: number | null;
    changedByUserId: string;
    changedByEmail: string;
    changeNote: string | null;
  },
): Promise<void> {
  if (entry.previousPriceCents === entry.newPriceCents) return;
  await tx.insert(priceHistoryTable).values(entry);
}

function productInsertValues(input: {
  slug: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number | null;
  campaignPriceCents: number | null;
  campaignStartsAt: string | null;
  campaignEndsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}) {
  return {
    slug: input.slug.trim(),
    name: input.name.trim(),
    category: input.category.trim(),
    description: input.description?.trim() || null,
    imageUrl: input.imageUrl?.trim() || null,
    basePriceCents: input.basePriceCents,
    campaignPriceCents: input.campaignPriceCents,
    campaignStartsAt: input.campaignStartsAt
      ? new Date(input.campaignStartsAt)
      : null,
    campaignEndsAt: input.campaignEndsAt
      ? new Date(input.campaignEndsAt)
      : null,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

function buildBulkPreviewRow(
  change: {
    itemType: "product" | "option";
    itemId: string;
    priceCents: number | null;
    expectedUpdatedAt: string;
  },
  itemName: string,
  previousPriceCents: number | null,
) {
  return {
    itemType: change.itemType,
    itemId: change.itemId,
    itemName,
    previousPriceCents,
    newPriceCents: change.priceCents,
    expectedUpdatedAt: change.expectedUpdatedAt,
  };
}

/**
 * Bu uç nokta bilerek korumasızdır: oturum yoksa 401 fırlatmak yerine
 * `canManage: false` döner. Böylece ön yüz "giriş ekranı göster" ile
 * "hata oluştu" durumlarını birbirinden ayırabilir.
 */
router.get("/admin/access", (req, res): void => {
  const canManage = hasAdminSession(req);
  res.json(
    GetAdminAccessResponse.parse({
      canManage,
      email: canManage ? adminLabel() : null,
    }),
  );
});

router.get("/admin/pricing", requireCafeAdmin, async (_req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .orderBy(asc(productsTable.category), asc(productsTable.sortOrder), asc(productsTable.name));
  const options = await db
    .select({
      option: menuOptionsTable,
      product: productsTable,
    })
    .from(menuOptionsTable)
    .innerJoin(productsTable, eq(menuOptionsTable.productId, productsTable.id))
    .orderBy(asc(productsTable.name), asc(menuOptionsTable.sortOrder), asc(menuOptionsTable.name));

  res.json(
    ListAdminPricingResponse.parse({
      products: products.map(toAdminProduct),
      options: options.map(({ option, product }) =>
        toAdminOption(option, product),
      ),
    }),
  );
});

router.post("/admin/products", requireCafeAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const invalidPricing = productPricingError(input);
  if (invalidPricing) {
    res.status(400).json({ error: invalidPricing });
    return;
  }
  const actor = actorFromResponse(res);

  try {
    const product = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(productsTable)
        .values(productInsertValues(input))
        .returning();
      if (!created) throw new Error("Ürün kaydı oluşturulamadı.");

      await recordPriceChange(tx, {
        itemType: "product",
        priceField: "base_price",
        itemId: created.id,
        itemNameSnapshot: created.name,
        previousPriceCents: null,
        newPriceCents: created.basePriceCents,
        ...actor,
        changeNote: input.changeNote,
      });
      await recordPriceChange(tx, {
        itemType: "product",
        priceField: "campaign_price",
        itemId: created.id,
        itemNameSnapshot: created.name,
        previousPriceCents: null,
        newPriceCents: created.campaignPriceCents,
        ...actor,
        changeNote: input.changeNote,
      });
      return created;
    });
    res.status(201).json(CreateAdminProductResponse.parse(toAdminProduct(product)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Bu ürün bağlantısı zaten kullanılıyor." });
      return;
    }
    throw error;
  }
});

router.patch(
  "/admin/products/:productId",
  requireCafeAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminProductParams.safeParse(req.params);
    const parsed = UpdateAdminProductBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: params.success ? parsed.error.message : params.error.message,
      });
      return;
    }
    const input = parsed.data;
    const invalidPricing = productPricingError(input);
    if (invalidPricing) {
      res.status(400).json({ error: invalidPricing });
      return;
    }
    const actor = actorFromResponse(res);

    try {
      const product = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, params.data.productId))
          .for("update");
        if (!current) {
          throw new AdminPricingError("Ürün bulunamadı.", 404);
        }
        if (!matchesExpectedVersion(current.updatedAt, input.expectedUpdatedAt)) {
          throw new AdminPricingError(
            "Ürün bilgileri başka bir kullanıcı tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.",
            409,
          );
        }

        const [updated] = await tx
          .update(productsTable)
          .set({
            ...productInsertValues(input),
            updatedAt: timestampForUpdate(current.updatedAt),
          })
          .where(eq(productsTable.id, current.id))
          .returning();
        if (!updated) throw new Error("Ürün güncellenemedi.");

        await recordPriceChange(tx, {
          itemType: "product",
          priceField: "base_price",
          itemId: current.id,
          itemNameSnapshot: updated.name,
          previousPriceCents: current.basePriceCents,
          newPriceCents: updated.basePriceCents,
          ...actor,
          changeNote: input.changeNote,
        });
        await recordPriceChange(tx, {
          itemType: "product",
          priceField: "campaign_price",
          itemId: current.id,
          itemNameSnapshot: updated.name,
          previousPriceCents: current.campaignPriceCents,
          newPriceCents: updated.campaignPriceCents,
          ...actor,
          changeNote: input.changeNote,
        });
        return updated;
      });

      res.json(UpdateAdminProductResponse.parse(toAdminProduct(product)));
    } catch (error) {
      if (error instanceof AdminPricingError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Bu ürün bağlantısı zaten kullanılıyor." });
        return;
      }
      throw error;
    }
  },
);

router.post("/admin/options", requireCafeAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminOptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const invalidPricing = optionPricingError(input);
  if (invalidPricing) {
    res.status(400).json({ error: invalidPricing });
    return;
  }
  const actor = actorFromResponse(res);

  try {
    const created = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, input.productId));
      if (!product) {
        throw new AdminPricingError("Ürün bulunamadı.", 404);
      }
      const [option] = await tx
        .insert(menuOptionsTable)
        .values({
          productId: product.id,
          group: input.group.trim(),
          name: input.name.trim(),
          priceCents: input.priceCents,
          pricingModel: input.pricingModel,
          isActive: input.isActive,
          maxQuantity: input.maxQuantity,
          sortOrder: input.sortOrder,
          archivedAt: input.isActive ? null : new Date(),
        })
        .returning();
      if (!option) throw new Error("Ek malzeme kaydı oluşturulamadı.");
      await recordPriceChange(tx, {
        itemType: "option",
        priceField: "option_price",
        itemId: option.id,
        itemNameSnapshot: option.name,
        previousPriceCents: null,
        newPriceCents: option.priceCents,
        ...actor,
        changeNote: input.changeNote,
      });
      return { option, product };
    });
    res.status(201).json(
      CreateAdminOptionResponse.parse(
        toAdminOption(created.option, created.product),
      ),
    );
  } catch (error) {
    if (error instanceof AdminPricingError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "Bu ek malzeme bu ürün grubunda zaten var." });
      return;
    }
    throw error;
  }
});

router.patch(
  "/admin/options/:optionId",
  requireCafeAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminOptionParams.safeParse(req.params);
    const parsed = UpdateAdminOptionBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: params.success ? parsed.error.message : params.error.message,
      });
      return;
    }
    const input = parsed.data;
    const invalidPricing = optionPricingError(input);
    if (invalidPricing) {
      res.status(400).json({ error: invalidPricing });
      return;
    }
    const actor = actorFromResponse(res);

    try {
      const result = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(menuOptionsTable)
          .where(eq(menuOptionsTable.id, params.data.optionId))
          .for("update");
        if (!current) {
          throw new AdminPricingError("Ek malzeme bulunamadı.", 404);
        }
        if (!matchesExpectedVersion(current.updatedAt, input.expectedUpdatedAt)) {
          throw new AdminPricingError(
            "Ek malzeme başka bir kullanıcı tarafından değiştirildi. Sayfayı yenileyip tekrar deneyin.",
            409,
          );
        }

        const [updated] = await tx
          .update(menuOptionsTable)
          .set({
            group: input.group.trim(),
            name: input.name.trim(),
            priceCents: input.priceCents,
            pricingModel: input.pricingModel,
            isActive: input.isActive,
            maxQuantity: input.maxQuantity,
            sortOrder: input.sortOrder,
            archivedAt: input.isActive ? null : new Date(),
            updatedAt: timestampForUpdate(current.updatedAt),
          })
          .where(eq(menuOptionsTable.id, current.id))
          .returning();
        if (!updated) throw new Error("Ek malzeme güncellenemedi.");
        await recordPriceChange(tx, {
          itemType: "option",
          priceField: "option_price",
          itemId: current.id,
          itemNameSnapshot: updated.name,
          previousPriceCents: current.priceCents,
          newPriceCents: updated.priceCents,
          ...actor,
          changeNote: input.changeNote,
        });
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, updated.productId));
        if (!product) throw new Error("Ek malzemenin ürünü bulunamadı.");
        return { option: updated, product };
      });
      res.json(
        UpdateAdminOptionResponse.parse(
          toAdminOption(result.option, result.product),
        ),
      );
    } catch (error) {
      if (error instanceof AdminPricingError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Bu ek malzeme bu ürün grubunda zaten var." });
        return;
      }
      throw error;
    }
  },
);

router.get(
  "/admin/price-history",
  requireCafeAdmin,
  async (req, res): Promise<void> => {
    const parsed = ListPriceHistoryQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(priceHistoryTable)
      .orderBy(desc(priceHistoryTable.createdAt))
      .limit(parsed.data.limit);
    res.json(
      ListPriceHistoryResponse.parse({
        entries: rows.map((entry) => ({
          id: entry.id,
          itemType: entry.itemType,
          priceField: entry.priceField,
          itemId: entry.itemId,
          itemName: entry.itemNameSnapshot,
          previousPriceCents: entry.previousPriceCents,
          newPriceCents: entry.newPriceCents,
          changedByEmail: entry.changedByEmail,
          changeNote: entry.changeNote,
          createdAt: entry.createdAt.toISOString(),
        })),
      }),
    );
  },
);

router.post(
  "/admin/pricing/bulk-preview",
  requireCafeAdmin,
  async (req, res): Promise<void> => {
    const parsed = PreviewBulkPricingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const keys = parsed.data.changes.map(
      (change) => `${change.itemType}:${change.itemId}`,
    );
    if (new Set(keys).size !== keys.length) {
      res.status(400).json({ error: "Toplu işlemde aynı kayıt yalnızca bir kez seçilebilir." });
      return;
    }

    try {
      const rows = [];
      for (const change of parsed.data.changes) {
        if (change.itemType === "product") {
          const [product] = await db
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, change.itemId));
          if (!product) throw new AdminPricingError("Ürün bulunamadı.", 404);
          if (!matchesExpectedVersion(product.updatedAt, change.expectedUpdatedAt)) {
            throw new AdminPricingError("Bir ürün değişmiş. Toplu fiyat önizlemesini yenileyin.", 409);
          }
          if (product.isActive && change.priceCents === null) {
            throw new AdminPricingError("Satıştaki ürünün fiyatı boş bırakılamaz.", 400);
          }
          if (
            change.priceCents !== null &&
            product.campaignPriceCents !== null &&
            change.priceCents <= product.campaignPriceCents
          ) {
            throw new AdminPricingError("Normal fiyat kampanya fiyatından yüksek olmalıdır.", 400);
          }
          rows.push(
            buildBulkPreviewRow(change, product.name, product.basePriceCents),
          );
        } else {
          const [option] = await db
            .select()
            .from(menuOptionsTable)
            .where(eq(menuOptionsTable.id, change.itemId));
          if (!option) throw new AdminPricingError("Ek malzeme bulunamadı.", 404);
          if (!matchesExpectedVersion(option.updatedAt, change.expectedUpdatedAt)) {
            throw new AdminPricingError("Bir ek malzeme değişmiş. Toplu fiyat önizlemesini yenileyin.", 409);
          }
          if (option.isActive && change.priceCents === null) {
            throw new AdminPricingError("Satıştaki ek malzemenin fiyatı boş bırakılamaz.", 400);
          }
          if (
            option.pricingModel === "free"
              ? change.priceCents !== 0 && change.priceCents !== null
              : change.priceCents === 0
          ) {
            throw new AdminPricingError("Ek malzeme fiyatı fiyatlandırma kuralıyla uyuşmuyor.", 400);
          }
          rows.push(
            buildBulkPreviewRow(change, option.name, option.priceCents),
          );
        }
      }

      res.json(PreviewBulkPricingResponse.parse({ changes: rows }));
    } catch (error) {
      if (error instanceof AdminPricingError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

router.post(
  "/admin/pricing/bulk-apply",
  requireCafeAdmin,
  async (req, res): Promise<void> => {
    const parsed = ApplyBulkPricingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const keys = parsed.data.changes.map(
      (change) => `${change.itemType}:${change.itemId}`,
    );
    if (new Set(keys).size !== keys.length) {
      res.status(400).json({ error: "Toplu işlemde aynı kayıt yalnızca bir kez seçilebilir." });
      return;
    }
    const actor = actorFromResponse(res);

    try {
      const updatedCount = await db.transaction(async (tx) => {
        for (const change of parsed.data.changes) {
          if (change.itemType === "product") {
            const [current] = await tx
              .select()
              .from(productsTable)
              .where(eq(productsTable.id, change.itemId))
              .for("update");
            if (!current) throw new AdminPricingError("Ürün bulunamadı.", 404);
            if (!matchesExpectedVersion(current.updatedAt, change.expectedUpdatedAt)) {
              throw new AdminPricingError("Bir ürün değişmiş. Sayfayı yenileyip önizlemeyi tekrarlayın.", 409);
            }
            if (current.isActive && change.priceCents === null) {
              throw new AdminPricingError("Satıştaki ürünün fiyatı boş bırakılamaz.", 400);
            }
            if (
              change.priceCents !== null &&
              current.campaignPriceCents !== null &&
              change.priceCents <= current.campaignPriceCents
            ) {
              throw new AdminPricingError("Normal fiyat kampanya fiyatından yüksek olmalıdır.", 400);
            }
            await tx
              .update(productsTable)
              .set({
                basePriceCents: change.priceCents,
                updatedAt: timestampForUpdate(current.updatedAt),
              })
              .where(eq(productsTable.id, current.id));
            await recordPriceChange(tx, {
              itemType: "product",
              priceField: "base_price",
              itemId: current.id,
              itemNameSnapshot: current.name,
              previousPriceCents: current.basePriceCents,
              newPriceCents: change.priceCents,
              ...actor,
              changeNote: parsed.data.changeNote,
            });
          } else {
            const [current] = await tx
              .select()
              .from(menuOptionsTable)
              .where(eq(menuOptionsTable.id, change.itemId))
              .for("update");
            if (!current) {
              throw new AdminPricingError("Ek malzeme bulunamadı.", 404);
            }
            if (!matchesExpectedVersion(current.updatedAt, change.expectedUpdatedAt)) {
              throw new AdminPricingError("Bir ek malzeme değişmiş. Sayfayı yenileyip önizlemeyi tekrarlayın.", 409);
            }
            if (current.isActive && change.priceCents === null) {
              throw new AdminPricingError("Satıştaki ek malzemenin fiyatı boş bırakılamaz.", 400);
            }
            if (
              current.pricingModel === "free"
                ? change.priceCents !== 0 && change.priceCents !== null
                : change.priceCents === 0
            ) {
              throw new AdminPricingError("Ek malzeme fiyatı fiyatlandırma kuralıyla uyuşmuyor.", 400);
            }
            await tx
              .update(menuOptionsTable)
              .set({
                priceCents: change.priceCents,
                updatedAt: timestampForUpdate(current.updatedAt),
              })
              .where(eq(menuOptionsTable.id, current.id));
            await recordPriceChange(tx, {
              itemType: "option",
              priceField: "option_price",
              itemId: current.id,
              itemNameSnapshot: current.name,
              previousPriceCents: current.priceCents,
              newPriceCents: change.priceCents,
              ...actor,
              changeNote: parsed.data.changeNote,
            });
          }
        }
        return parsed.data.changes.length;
      });
      res.json(ApplyBulkPricingResponse.parse({ updatedCount }));
    } catch (error) {
      if (error instanceof AdminPricingError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

export default router;
