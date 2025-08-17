export interface ApiResponse<T = any> {
  status: number;   // HTTP status code
  data: T | null;   // Data payload (array/object)
  message: string;  // Success or error message
}

export function successResponse<T>(
  data: T,
  message = 'Success',
  status = 200,
): ApiResponse<T> {
  return {
    status,
    data,
    message,
  };
}

export function errorResponse(
  message: string,
  status = 500,
  data: any = null,
): ApiResponse {
  return {
    status,
    data,
    message,
  };
}
