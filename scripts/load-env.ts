/**
 * 脚本环境变量加载（与 Next.js 优先级保持一致）。
 *
 * 必须在导入 @/lib/prisma、@/lib/ali-oss 等会在模块顶层读取 process.env 的模块之前
 * 作为第一个 import 引入。
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.production.local" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });
