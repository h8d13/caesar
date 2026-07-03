class HttpValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'HttpValidationError';
    this.field = field;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class PayloadTooLargeError extends Error {
  constructor(message = 'Payload too large') {
    super(message);
    this.name = 'PayloadTooLargeError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { HttpValidationError, PayloadTooLargeError };
