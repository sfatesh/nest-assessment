import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { TaskFilterDto } from './dto/task-filter.dto';
import { ApiResponse, errorResponse, successResponse } from '@common/utils/api-response.util';



@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,

  ) { }

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto) {
    try {
      const result = await this.tasksService.create(createTaskDto);
      return successResponse(result, 'Task created successfully', HttpStatus.CREATED);
    } catch (error) {
      return errorResponse(
        error as string || 'An error occurred while creating the task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  // @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  async findAll(@Query() filterDto: TaskFilterDto): Promise<ApiResponse> {
    // // Inefficient approach: Inconsistent pagination handling
    // if (page && !limit) {
    //   limit = 10; // Default limit
    // }

    // // Inefficient processing: Manual filtering instead of using repository
    // let tasks = await this.tasksService.findAll();

    // // Inefficient filtering: In-memory filtering instead of database filtering
    // if (status) {
    //   tasks = tasks.filter(task => task.status === status as TaskStatus);
    // }

    // if (priority) {
    //   tasks = tasks.filter(task => task.priority === priority as TaskPriority);
    // }

    // // Inefficient pagination: In-memory pagination
    // if (page && limit) {
    //   const startIndex = (page - 1) * limit;
    //   const endIndex = page * limit;
    //   tasks = tasks.slice(startIndex, endIndex);
    // }
    // return {
    //   data: data,
    //   count: total,
    //   // Missing metadata for proper pagination
    // };
    try {
      const result = await this.tasksService.findAll(filterDto);
      return successResponse(result, 'Task retrieved successfully', HttpStatus.OK);
    } catch (error) {
      return errorResponse(
        error as string || 'An error occurred while fetching the task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    try {

      const [completed, inProgress, pending] = await Promise.all([
        this.tasksService.findByStatus(TaskStatus.COMPLETED),
        this.tasksService.findByStatus(TaskStatus.IN_PROGRESS),
        this.tasksService.findByStatus(TaskStatus.PENDING),
      ]);

      // If you want to also calculate high priority
      const highPriorityCount = (await this.tasksService.findAll({ priority: TaskPriority.HIGH })).total;

      // Return structured response
      return successResponse({
        total: completed.length + inProgress.length + pending.length,
        completed: completed.length,
        inProgress: inProgress.length,
        pending: pending.length,
        highPriority: highPriorityCount,
      }, 'Task statistics retrieved successfully', HttpStatus.OK);
    } catch (error) {
      return errorResponse(
        error as string || 'An error occurred while fetching task statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    try {
      // return 'Here you would return the task by ID';
      const result = await this.tasksService.findOne(id);
      return successResponse(result, 'Task retrieved successfully', HttpStatus.OK);
    } catch (error) {
      // Handle error
      return errorResponse(
        error as string || `Task with ID ${id} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    try {
      const task = await this.tasksService.findOne(id);
      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      // Update the task
      const updatedTask = await this.tasksService.update(id, updateTaskDto);

      // Return structured response

      return successResponse(updatedTask, `Task with ID ${id} successfully updated`, HttpStatus.OK);
    } catch (error) {
      // Handle error
      return errorResponse(
        error as string || `An error occurred while updating the task with ID ${id}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    }
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@Param('id') id: string) {
    try {
      //create findAnd delete function---📌
      // Find the task before attempting to delete
      // const task = await this.tasksService.findOne(id);
      // if (!task) {
      //   throw new NotFoundException(`Task with ID ${id} not found`);
      // }

      // Remove the task
      const task = await this.tasksService.remove(id);

      // Return a consistent success response
      return successResponse(task, `Task with ID ${id} successfully deleted`, HttpStatus.OK);

    } catch (error) {
      // Handle error
      return errorResponse(
        error as string || `An error occurred while deleting the task with ID ${id}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

    }
  }

  @Post('batch')
@ApiOperation({ summary: 'Batch process multiple tasks' })
async batchProcess(@Body() body: { tasks: string[]; action: string }) {
  const { tasks: taskIds, action } = body;

  // Validate input upfront
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return errorResponse('No tasks provided', HttpStatus.BAD_REQUEST);
  }

  if (!['complete', 'delete'].includes(action)) {
    return errorResponse('Unknown batch action', HttpStatus.BAD_REQUEST);
  }

  try {
    let result;

    switch (action) {
      case 'complete':
        // ✅ bulk update (single DB query)
        result = await this.tasksService.updateStatus(taskIds, TaskStatus.COMPLETED);
        break;

      case 'delete':
        // ✅ bulk delete (single DB query)
        result = await this.tasksService.bulkDelete(taskIds);
        break;
    }

    return successResponse({
      processed: taskIds.length,
      affected: result?.affected || 0,
    }, 'Batch processing completed', HttpStatus.OK);

  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Batch processing failed',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

} 