/**
 * Background Job Queue Manager
 * Handles async processing for heavy operations
 */
import Queue from 'bull';
import logger from './logger.js';

class JobQueueManager {
  constructor() {
    this.queues = {};
    this.isEnabled = process.env.REDIS_ENABLED === 'true';
    
    const redisConfig = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
      },
    };

    if (this.isEnabled) {
      // Initialize queues
      this.queues = {
        receipts: new Queue('receipts', redisConfig),
        reports: new Queue('reports', redisConfig),
        emails: new Queue('emails', redisConfig),
        cleanup: new Queue('cleanup', redisConfig),
      };

      // Setup queue event handlers
      this.setupQueueHandlers();
      
      logger.info('✓ Job queues initialized');
    } else {
      logger.info('Job queues disabled (Redis not enabled)');
    }
  }

  /**
   * Setup event handlers for all queues
   */
  setupQueueHandlers() {
    Object.entries(this.queues).forEach(([name, queue]) => {
      queue.on('error', (error) => {
        logger.error(`Queue ${name} error:`, error);
      });

      queue.on('waiting', (jobId) => {
        logger.debug(`Job ${jobId} waiting in queue ${name}`);
      });

      queue.on('active', (job) => {
        logger.debug(`Job ${job.id} active in queue ${name}`);
      });

      queue.on('completed', (job, result) => {
        logger.info(`Job ${job.id} completed in queue ${name}`, { result });
      });

      queue.on('failed', (job, error) => {
        logger.error(`Job ${job.id} failed in queue ${name}:`, error);
      });

      queue.on('stalled', (job) => {
        logger.warn(`Job ${job.id} stalled in queue ${name}`);
      });
    });
  }

  /**
   * Add job to queue
   * @param {String} queueName - Queue name
   * @param {String} jobName - Job name/type
   * @param {Object} data - Job data
   * @param {Object} options - Job options
   */
  async addJob(queueName, jobName, data, options = {}) {
    if (!this.isEnabled) {
      logger.warn(`Cannot add job ${jobName} - queues disabled`);
      return null;
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const defaultOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    };

    const job = await queue.add(jobName, data, { ...defaultOptions, ...options });
    logger.debug(`Job ${job.id} added to queue ${queueName}`);
    
    return job;
  }

  /**
   * Process jobs in queue
   * @param {String} queueName - Queue name
   * @param {String} jobName - Job name/type
   * @param {Function} processor - Job processor function
   * @param {Number} concurrency - Number of concurrent jobs
   */
  processJob(queueName, jobName, processor, concurrency = 1) {
    if (!this.isEnabled) {
      logger.warn(`Cannot process jobs in ${queueName} - queues disabled`);
      return;
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    queue.process(jobName, concurrency, async (job) => {
      logger.info(`Processing job ${job.id} (${jobName}) in queue ${queueName}`);
      
      try {
        const result = await processor(job);
        logger.info(`Job ${job.id} completed successfully`);
        return result;
      } catch (error) {
        logger.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    });

    logger.info(`Registered processor for ${jobName} in queue ${queueName}`);
  }

  /**
   * Get job status
   * @param {String} queueName - Queue name
   * @param {String} jobId - Job ID
   */
  async getJobStatus(queueName, jobId) {
    if (!this.isEnabled) {
      return null;
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();
    const failedReason = job.failedReason;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      state,
      progress,
      failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  /**
   * Get queue stats
   * @param {String} queueName - Queue name
   */
  async getQueueStats(queueName) {
    if (!this.isEnabled) {
      return null;
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Clean completed jobs
   * @param {String} queueName - Queue name
   * @param {Number} grace - Grace period in milliseconds
   */
  async cleanQueue(queueName, grace = 86400000) {
    if (!this.isEnabled) {
      return;
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    
    logger.info(`Queue ${queueName} cleaned`);
  }

  /**
   * Close all queues
   */
  async close() {
    if (!this.isEnabled) {
      return;
    }

    await Promise.all(
      Object.values(this.queues).map(queue => queue.close())
    );
    
    logger.info('All job queues closed');
  }

  /**
   * Pause queue
   * @param {String} queueName - Queue name
   */
  async pauseQueue(queueName) {
    if (!this.isEnabled) {
      return;
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  }

  /**
   * Resume queue
   * @param {String} queueName - Queue name
   */
  async resumeQueue(queueName) {
    if (!this.isEnabled) {
      return;
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  }
}

// Create singleton instance
const jobQueueManager = new JobQueueManager();

export default jobQueueManager;
