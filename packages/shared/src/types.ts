export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
