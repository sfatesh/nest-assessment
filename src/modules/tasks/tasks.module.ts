import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CacheService } from '../../common/services/cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    
  ],
  controllers: [TasksController],
  providers: [RateLimitGuard,CacheService, TasksService],
  exports: [TasksService],
})
export class TasksModule {} 