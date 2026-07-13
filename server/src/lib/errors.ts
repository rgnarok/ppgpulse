/** HTTP-aware error with a stable `code` for the client. */
export class HttpError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, message: string, code = 'error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', code = 'bad_request') {
    super(400, message, code);
  }
}
export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', code = 'unauthorized') {
    super(401, message, code);
  }
}
export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', code = 'forbidden') {
    super(403, message, code);
  }
}
export class NotFoundError extends HttpError {
  constructor(message = 'Not found', code = 'not_found') {
    super(404, message, code);
  }
}
export class ConflictError extends HttpError {
  constructor(message = 'Conflict', code = 'conflict') {
    super(409, message, code);
  }
}
