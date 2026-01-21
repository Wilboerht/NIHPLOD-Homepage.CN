/**
 * AI 请求队列管理器
 * 
 * 功能：
 * 1. 控制并发数量，避免 AI 服务 429 限流
 * 2. 请求排队机制，高峰期有序处理
 * 3. 提供队列状态查询，支持前端显示排队位置
 * 
 * 使用方式：
 * const result = await aiQueue.enqueue('face-analyze', () => callAI(...));
 */

import { aiLogger } from "./logger";

/**
 * 队列项
 */
interface QueueItem<T> {
    id: string;
    type: string;
    execute: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    enqueuedAt: number;
    startedAt?: number;
}

/**
 * 队列统计信息
 */
export interface QueueStats {
    /** 当前排队数量 */
    queueLength: number;
    /** 正在执行的数量 */
    runningCount: number;
    /** 最大并发数 */
    maxConcurrent: number;
    /** 预估等待时间（秒） */
    estimatedWaitSeconds: number;
    /** 当前是否繁忙 */
    isBusy: boolean;
}

/**
 * 入队返回结果
 */
export interface EnqueueResult<T> {
    /** 请求 ID */
    requestId: string;
    /** 排队位置（从 1 开始，0 表示正在执行） */
    position: number;
    /** 预估等待时间（秒） */
    estimatedWaitSeconds: number;
    /** 结果 Promise */
    promise: Promise<T>;
}

/**
 * AI 请求队列类
 */
class AIRequestQueue {
    /** 等待队列 */
    private queue: QueueItem<unknown>[] = [];

    /** 正在执行的请求数 */
    private runningCount = 0;

    /** 最大并发数 */
    private maxConcurrent: number;

    /** 平均执行时间（毫秒），用于估算等待时间 */
    private avgExecutionTimeMs = 8000; // 默认 8 秒

    /** 最近执行时间记录（用于计算平均值） */
    private executionTimes: number[] = [];

    /** 请求 ID 计数器 */
    private idCounter = 0;

    constructor(maxConcurrent = 10) {
        this.maxConcurrent = maxConcurrent;
        aiLogger.info("AI Queue initialized", { maxConcurrent });
    }

    /**
     * 生成唯一请求 ID
     */
    private generateId(): string {
        return `req_${Date.now()}_${++this.idCounter}`;
    }

    /**
     * 计算预估等待时间
     */
    private estimateWaitTime(position: number): number {
        if (position === 0) return 0;

        // 预估：(排队位置 / 最大并发数) * 平均执行时间
        const waitTimeMs = (Math.ceil(position / this.maxConcurrent)) * this.avgExecutionTimeMs;
        return Math.ceil(waitTimeMs / 1000);
    }

    /**
     * 更新平均执行时间
     */
    private updateAvgExecutionTime(durationMs: number) {
        this.executionTimes.push(durationMs);
        // 只保留最近 20 条记录
        if (this.executionTimes.length > 20) {
            this.executionTimes.shift();
        }
        // 计算平均值
        this.avgExecutionTimeMs =
            this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length;
    }

    /**
     * 将请求加入队列
     */
    enqueue<T>(type: string, execute: () => Promise<T>): EnqueueResult<T> {
        const id = this.generateId();

        // 计算当前位置
        const position = this.runningCount >= this.maxConcurrent
            ? this.queue.length + 1
            : 0;

        const promise = new Promise<T>((resolve, reject) => {
            const item: QueueItem<T> = {
                id,
                type,
                execute,
                resolve: resolve as (value: unknown) => void,
                reject,
                enqueuedAt: Date.now(),
            };

            this.queue.push(item as QueueItem<unknown>);

            aiLogger.info("Request enqueued", {
                id,
                type,
                position: position || "executing",
                queueLength: this.queue.length,
                runningCount: this.runningCount,
            });

            // 尝试处理队列
            this.processQueue();
        });

        return {
            requestId: id,
            position,
            estimatedWaitSeconds: this.estimateWaitTime(position),
            promise,
        };
    }

    /**
     * 处理队列
     */
    private async processQueue() {
        // 如果已达到并发上限或队列为空，不处理
        if (this.runningCount >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        // 取出队列中的第一个请求
        const item = this.queue.shift();
        if (!item) return;

        this.runningCount++;
        item.startedAt = Date.now();

        aiLogger.info("Request started", {
            id: item.id,
            type: item.type,
            waitedMs: item.startedAt - item.enqueuedAt,
            runningCount: this.runningCount,
            queueRemaining: this.queue.length,
        });

        try {
            const result = await item.execute();
            const durationMs = Date.now() - item.startedAt;

            // 更新平均执行时间
            this.updateAvgExecutionTime(durationMs);

            aiLogger.info("Request completed", {
                id: item.id,
                type: item.type,
                durationMs,
                avgExecutionTimeMs: Math.round(this.avgExecutionTimeMs),
            });

            item.resolve(result);
        } catch (error) {
            aiLogger.error("Request failed", {
                id: item.id,
                type: item.type,
                error: error instanceof Error ? error.message : "Unknown error",
            });

            item.reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
            this.runningCount--;
            // 继续处理队列中的下一个请求
            this.processQueue();
        }
    }

    /**
     * 获取请求在队列中的位置
     * @returns 位置（从 1 开始），0 表示正在执行或不在队列中
     */
    getPosition(requestId: string): number {
        const index = this.queue.findIndex(item => item.id === requestId);
        return index === -1 ? 0 : index + 1;
    }

    /**
     * 获取队列统计信息
     */
    getStats(): QueueStats {
        const queueLength = this.queue.length;
        const isBusy = this.runningCount >= this.maxConcurrent || queueLength > 0;

        return {
            queueLength,
            runningCount: this.runningCount,
            maxConcurrent: this.maxConcurrent,
            estimatedWaitSeconds: this.estimateWaitTime(queueLength),
            isBusy,
        };
    }

    /**
     * 设置最大并发数（运行时动态调整）
     */
    setMaxConcurrent(value: number) {
        this.maxConcurrent = Math.max(1, value);
        aiLogger.info("Max concurrent updated", { maxConcurrent: this.maxConcurrent });
        // 尝试处理更多请求
        this.processQueue();
    }
}

// 全局单例
export const aiQueue = new AIRequestQueue(
    parseInt(process.env.AI_QUEUE_MAX_CONCURRENT || "10", 10)
);

// 导出类型供测试使用
export { AIRequestQueue };
