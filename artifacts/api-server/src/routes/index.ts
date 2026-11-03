import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountRouter from "./account";
import sessionsRouter from "./sessions";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(sessionsRouter);
router.use(dashboardRouter);

export default router;
