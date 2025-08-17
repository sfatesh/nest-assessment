import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { errorResponse } from '../utils/api-response.util';

// TODO: Implement comprehensive error handling
    // This filter should:
    // 1. Log errors appropriately based on their severity ✅
    // 2. Format error responses in a consistent way ✅
    // 3. Include relevant error details without exposing sensitive information ✅
    // 4. Handle different types of errors with appropriate status codes ✅
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any).message || HttpStatus[status];
    } else if (exception instanceof QueryFailedError) {
      const pgError = (exception as any).driverError;
      if (pgError?.code === '22P02') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid input format';
      } else if (pgError?.code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'Duplicate record';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log internal errors
    if (status >= 500) {
      this.logger.error(
        `Error at ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );
    }

    response.status(status).json(errorResponse(message, status));
  }
}
