export class BungieAuthorizationError extends Error {
  readonly error: string;
  readonly error_description: string;

  constructor(error: string, error_description: string) {
    super(error_description);
    this.error = error;
    this.error_description = error_description;
  }
}
