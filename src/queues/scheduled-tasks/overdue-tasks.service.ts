import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';
import { TasksService } from '@modules/tasks/tasks.service';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private taskService: TasksService,
    // @InjectRepository(Task)
    // private tasksRepository: Repository<Task>,
  ) { }

  // TODO: Implement the overdue tasks checker✅
  // This method should run every hour and check for overdue tasks ✅
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    try {
      const now = new Date();

      // 1. Find overdue tasks
      const overdueTasks:any = 
      await this.taskService.findOverdueTasks({
          dueDate: LessThan(now),
          status: TaskStatus.PENDING,
        },
      //   select: ['id'], // Only fetch what you need for queueing
      );

      this.logger.log(`Found ${overdueTasks.length} overdue tasks`);

      if (!overdueTasks.length) {
        return this.formatResponse(true, [], 'No overdue tasks found');
      }

      // 2. Add them to the queue in parallel (limit concurrency if needed)
      const results = await Promise.allSettled(
        overdueTasks.map((task:{id:number,status:string, reason?:string}) =>
          this.taskQueue.add('overdue-tasks-notification', { taskId: task.id })
        )
      );

      // 3. Count failures
      let successCount = 0;
      let failCount = 0;
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          failCount++;
          this.logger.error(`Failed to queue task: ${result.reason}`);
        }
      });

      this.logger.log(
        `Overdue tasks queued: ${successCount} success, ${failCount} failed`
      );

      return this.formatResponse(
        true,
        { successCount, failCount },
        'Overdue tasks check completed'
      );

    } catch (error) {
      this.logger.error(
        `Error during overdue tasks check: ${error instanceof Error ? error.message : error
        }`
      );
      return this.formatResponse(false, [], 'Error checking overdue tasks');
    }
  }

  private formatResponse(success: boolean, data: any, message: string) {
    return {
      status: success ? 200 : 500,
      success,
      data: data ?? [],
      message
    };
  }
} 