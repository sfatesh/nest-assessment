import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';


@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly MAX_ATTEMPTS = 3;
  private readonly VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService,@InjectQueue('task-processing')
      private taskQueue: Queue,) {
    super();
  }

  // Inefficient implementation:
  // - No proper job batching ✅
  // - No error handling strategy   ✅
  // - No retries for failed jobs   ✅
  // - No concurrency control       ✅
  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);

        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      // Controlled error logging based on retries
      const attempts = job.attemptsMade ?? 0;
      const maxAttempts = job.opts?.attempts ?? 1;

      this.logger.error(
        `Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'} (attempt ${attempts}/${maxAttempts})`,
      );

      // If we still have retry attempts left — rethrow to let BullMQ retry automatically
      if (attempts < maxAttempts - 1) {
        throw error;
      }

      // Otherwise log final failure & return structured response
      return { success: false, error: error || 'Job failed permanently' };
    }
  }


  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    // 1) Validate input
    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }
    if (!this.VALID_STATUSES.includes(status)) {
      return { success: false, error: `Invalid status value: ${status}` };
    }

    let attempt = 0;
    let lastError: any = null;

    // 2) Retry mechanism
    while (attempt < this.MAX_ATTEMPTS) {
      attempt++;

      try {
        // 3) Transaction-safe status update
        const updatedTask = await this.tasksService.updateStatus(taskId, status);

        return {
          success: true,
          taskId: updatedTask,
          newStatus: updatedTask,
        };
      } catch (err) {
        lastError = err;
        this.logger.error(
          `Attempt ${attempt} failed for job=${job.id}, task=${taskId}: ${err}`,
        );
      }
    }

    // 4) If all retries fail, return error
    return {
      success: false,
      error: `Failed to update task status after ${this.MAX_ATTEMPTS} attempts`,
      detail: lastError?.message,
    };
  }

  private readonly CHUNK_SIZE = 50;

  private async handleOverdueTasks(job: Job) {
    try {
      this.logger.debug(`Processing overdue tasks notification (job ${job.id})`);

      // 1. Load overdue tasks
      const overdueTasks = await this.tasksService.findOverdueTasks({}); // Returns [] of tasks

      if (!overdueTasks.length) {
        this.logger.log('No overdue tasks found');
        return { success: true, processed: 0 };
      }

      let successCount = 0;
      let failureCount = 0;

      // 2. Process in chunks
      for (let i = 0; i < overdueTasks.length; i += this.CHUNK_SIZE) {
        const chunk = overdueTasks.slice(i, i + this.CHUNK_SIZE);

        // 3. Add child jobs in bulk (more efficient than loop)
        try {
          const bulkJobs = chunk.map((task: any) => {
            this.taskQueue.add('task-status-update', {
              taskId: task.id,
              status: task.status,
            });
          //   ({
          //   name: 'task-status-update',
          //   data: { taskId: task.id, status: task.status },
          //   opts: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
          // })
          });

          // await this.taskQueue.addBulk(bulkJobs);
          successCount += chunk.length;
        } catch (err) {
          failureCount += chunk.length;
          this.logger.error(`Failed to enqueue chunk starting at index ${i}: ${err}`);
        }
      }

      this.logger.log(
        `Overdue tasks queued: success=${successCount}, failed=${failureCount}`,
      );

      return {
        success: true,
        processed: successCount,
        failed: failureCount,
        message: 'Overdue tasks have been queued for processing',
      };
    } catch (err) {
      this.logger.error(`handleOverdueTasks failed: ${err}`, err);
      throw err; // Let the processor retry this job if configured
    }
  }

} 