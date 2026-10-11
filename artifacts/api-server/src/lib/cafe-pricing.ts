import type {
  PersistedOrderOption,
  Product,
} from "@workspace/db";

export class CafePricingError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "CafePricingError";
  }
}

export type EffectiveProductPrice = {
  listPriceCents: number;
  effectivePriceCents: number;
  campaignDiscountCents: number;
};

export function getEffectiveProductPrice(
  product: Pick<
    Product,
    | "basePriceCents"
    | "campaignPriceCents"
    | "campaignStartsAt"
    | "campaignEndsAt"
  >,
  now = new Date(),
): EffectiveProductPrice | null {
  if (product.basePriceCents === null) return null;

  const startsAt = product.campaignStartsAt?.getTime() ?? null;
  const endsAt = product.campaignEndsAt?.getTime() ?? null;
  const campaignIsCurrent =
    product.campaignPriceCents !== null &&
    (startsAt === null || startsAt <= now.getTime()) &&
    (endsAt === null || now.getTime() < endsAt);

  const effectivePriceCents = campaignIsCurrent
    ? product.campaignPriceCents!
    : product.basePriceCents;

  return {
    listPriceCents: product.basePriceCents,
    effectivePriceCents,
    campaignDiscountCents: product.basePriceCents - effectivePriceCents,
  };
}

export type PricedOptionForOrder = {
  id: string;
  name: string;
  group: string;
  priceCents: number | null;
  pricingModel: "free" | "per_selection" | "per_unit" | "price_delta";
  maxQuantity: number;
};

export type SelectedPricedOption = {
  option: PricedOptionForOrder;
  quantity: number;
};

export type CalculatedOrderLine = {
  baseUnitPriceCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
  subtotalCents: number;
  discountCents: number;
  optionsSnapshot: PersistedOrderOption[];
};

export function calculateOrderLine(
  pricing: EffectiveProductPrice,
  productQuantity: number,
  selectedOptions: SelectedPricedOption[],
): CalculatedOrderLine {
  if (!Number.isInteger(productQuantity) || productQuantity < 1 || productQuantity > 20) {
    throw new CafePricingError("Ürün adedi 1 ile 20 arasında olmalıdır.");
  }

  let optionTotalPerProduct = 0;
  const optionsSnapshot = selectedOptions.map(({ option, quantity }) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > option.maxQuantity) {
      throw new CafePricingError(
        `${option.name} için adet 1 ile ${option.maxQuantity} arasında olmalıdır.`,
      );
    }
    if (option.priceCents === null) {
      throw new CafePricingError(`${option.name} için fiyat belirlenmemiş.`);
    }
    if (
      option.pricingModel !== "per_unit" &&
      option.pricingModel !== "free" &&
      quantity !== 1
    ) {
      throw new CafePricingError(`${option.name} yalnızca bir kez seçilebilir.`);
    }
    if (option.pricingModel === "free" && option.priceCents !== 0) {
      throw new CafePricingError(`${option.name} ücretsiz olarak işaretlenmiş ancak fiyatı sıfır değil.`);
    }
    if (option.pricingModel !== "free" && option.priceCents < 1) {
      throw new CafePricingError(`${option.name} için geçerli bir fiyat belirlenmemiş.`);
    }

    const perProductCents =
      option.pricingModel === "per_unit"
        ? option.priceCents * quantity
        : option.priceCents;
    optionTotalPerProduct += perProductCents;

    return {
      id: option.id,
      name: option.name,
      group: option.group,
      quantity,
      unitPriceCents: option.priceCents,
      totalCents: perProductCents * productQuantity,
    };
  });

  const unitPriceCents =
    pricing.effectivePriceCents + optionTotalPerProduct;
  const lineTotalCents = unitPriceCents * productQuantity;
  const subtotalCents =
    (pricing.listPriceCents + optionTotalPerProduct) * productQuantity;
  const discountCents =
    pricing.campaignDiscountCents * productQuantity;

  return {
    baseUnitPriceCents: pricing.listPriceCents,
    unitPriceCents,
    lineTotalCents,
    subtotalCents,
    discountCents,
    optionsSnapshot,
  };
}
