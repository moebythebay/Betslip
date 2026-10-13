import { Router, type IRouter } from "express";
import healthRouter from "./health";
import betsRouter from "./bets";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/bets", betsRouter);
router.use(dashboardRouter);

export default router;
