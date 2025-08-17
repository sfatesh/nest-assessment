import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // TODO: Implement comprehensive request/response logging
    // This interceptor should:
    // 1. Log incoming requests with relevant details ✅
    // 2. Measure and log response time ✅
    // 3. Log outgoing responses ✅
    // 4. Include contextual information like user IDs when available ✅
    // 5. Avoid logging sensitive information ✅

    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;
    const now = Date.now();
    const ip = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Extracted user ID if available
    const userId = req.user?.id || 'anonymous';

    // Remove sensitive fields before logging
    const sanitize = (obj: Record<string, any>) => {
      if (!obj) return obj;
      const cloned = { ...obj };
      const sensitiveFields = ['password', 'token', 'accessToken', 'refreshToken', 'authorization'];
      sensitiveFields.forEach((field) => {
        if (cloned[field] !== undefined) {
          cloned[field] = '[REDACTED]';
        }
      });
      return cloned;
    };

    // Log incoming request
    this.logger.log(
      `Incoming Request - ${method} ${url} | User: ${userId} | IP: ${ip} | UA: ${userAgent} | Params: ${JSON.stringify(
        sanitize(req.params),
      )} | Query: ${JSON.stringify(sanitize(req.query))} | Body: ${JSON.stringify(
        sanitize(req.body),
      )}`,
    );


    // Basic implementation (to be enhanced by candidates)
    // this.logger.log(`Request: ${method} ${url} ${userId} ${ip} ${userAgent}`);

    return next.handle().pipe(
      tap({
       next: (response) => {
          const duration = Date.now() - now;

          // Limit logged response size
          let preview = '';
          try {
            const str = JSON.stringify(response);
            preview = str.length > 200 ? str.substring(0, 200) + '...' : str;
          } catch {
            preview = '[unserializable response]';
          }

          this.logger.log(
            `Outgoing Response - ${method} ${url} | Status: ${
              req.res?.statusCode
            } | Duration: ${duration}ms | User: ${userId} | Response Preview: ${preview}`,
          );
        },
        error: (err) => {
          const duration = Date.now() - now;
          this.logger.error(
            `Error Response - ${method} ${url} | Status: ${
              req.res?.statusCode || 'unknown'
            } | Duration: ${duration}ms | User: ${userId} | Error: ${
              err.message
            }`,
          );
        },
      }),
    );
  }
} 