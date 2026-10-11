import { Router, type IRouter } from "express";
import healthRouter from "./health";
import menuRouter from "./menu";
import adminAuthRouter from "./admin-auth";
import adminPricingRouter from "./admin-pricing";
import adminOrdersRouter from "./admin-orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(menuRouter);
router.use(adminAuthRouter);
router.use(adminPricingRouter);
router.use(adminOrdersRouter);

export default router;
