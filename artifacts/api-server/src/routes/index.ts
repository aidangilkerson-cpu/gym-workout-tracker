import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountRouter from "./account";
import sessionsRouter from "./sessions";
import dashboardRouter from "./dashboard";
import workoutsRouter from "./workouts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(sessionsRouter);
router.use(dashboardRouter);
router.use(workoutsRouter);

export default router;
