export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(message = "Not found") {
  return new AppError(404, "NOT_FOUND", message);
}

export function forbidden(message = "You do not have access to this group") {
  return new AppError(403, "FORBIDDEN", message);
}
