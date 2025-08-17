import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskFilterDto } from './dto/task-filter.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) { }

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    return await this.tasksRepository.manager.transaction(async (manager) => {
      // 1. Create and save task inside the transaction
      const task = manager.create(Task, createTaskDto);
      const savedTask = await manager.save(task);

      try {
        // 2. Add to queue and wait for confirmation
        this.taskQueue.add('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        });
      } catch (queueError: any) {
        // Rollback will happen automatically if error is thrown
        throw new Error(`Task created but failed to enqueue: ${queueError.message}`);
      }

      return savedTask;
    });
  }

  async findAll(queryParams: TaskFilterDto): Promise<{ data: Task[]; total: number }> {

    const { status, priority, page = 1, limit = 10 } = queryParams;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    const [data, total] = await this.tasksRepository.findAndCount({
      skip,
      take: limit,
      relations: ['user'], // load only what's needed
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: {
          id: true,
          name: true, // only fetch required user fields
        },
      },
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      total,
    };
  }

  async findOne(id: string): Promise<Task> {
    try {
      const task =
        await this.tasksRepository.findOne({
          where: { id },
          relations: ['user'],
        });
      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      return task;
    } catch (error) {
      console.error('Error finding task:', error);
      console.error('Error finding task:', error);
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
  }

  // main thread
  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    return await this.tasksRepository.manager.transaction(async (manager) => {
      // Fetch task in transaction scope
      const task = await manager.findOne(Task, {
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      // Merge updated fields in one go
      manager.merge(Task, task, updateTaskDto);

      const updatedTask = await manager.save(task);

      // Queue processing with error safety
      if (originalStatus !== updatedTask.status) {
        try {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        } catch (queueError: any) {
          // Log error but don't break API response
          this.logger.error(
            `Failed to add task ${updatedTask.id} to status update queue`,
            queueError.stack,
          );
        }
      }

      return updatedTask;
    });
  }

  async remove(id: string): Promise<Task> {
    

    const task = await this.tasksRepository.findOne({
      where: { id},
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    const deleteResult = await this.tasksRepository.delete(id);

    if (deleteResult.affected === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return task;
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository.find({
      where: { status },
      relations: ['user'], // only if needed
    });
  }

  async findOverdueTasks(where: any): Promise<Array<{ status: TaskStatus }>> {
    return await this.tasksRepository.find({
      where: where,
      select: ['status'],
    })
  }
  

  async updateStatus(id: string | string[], status: string): Promise<{ affected: number }> {
  const ids = Array.isArray(id) ? id : [id];    // ⇐ normalize

  return this.tasksRepository.manager.transaction(async manager => {
    const result = await manager
      .getRepository(Task)
      .createQueryBuilder()
      .update(Task)
      .set({ status: status as TaskStatus })
      .whereInIds(ids)
      .execute();

    return { affected: result.affected ?? 0 };
  });
}


async bulkDelete(taskIds: string[]): Promise<void> {
  await this.tasksRepository.manager.transaction(async (manager) => {
   const tasks = await manager.getRepository(Task).findBy({ id: In(taskIds) });

    if (!tasks.length) {
      return 0;
    }

    // 2. Delete them
    await manager.getRepository(Task).remove(tasks);

    return tasks; 
  });
}

}
