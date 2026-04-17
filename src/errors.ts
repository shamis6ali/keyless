export class KeylessError extends Error {
  override readonly name: string = "KeylessError";
  constructor(message: string) {
    super(message);
  }
}

export class ValidationError extends KeylessError {
  override readonly name = "ValidationError";
  constructor(
    public readonly key: string,
    public readonly issues: string[],
  ) {
    super(`Validation failed for "${key}": ${issues.join("; ")}`);
  }
}

export class MissingSecretError extends KeylessError {
  override readonly name = "MissingSecretError";
  constructor(
    public readonly key: string,
    public readonly triedProviders: string[],
  ) {
    super(
      `Secret "${key}" was not found in any configured provider (tried: ${triedProviders.join(", ") || "<none>"})`,
    );
  }
}

export class ProviderError extends KeylessError {
  override readonly name = "ProviderError";
  constructor(
    public readonly provider: string,
    public readonly key: string,
    public override readonly cause: unknown,
  ) {
    super(`Provider "${provider}" threw while fetching "${key}"`);
  }
}

export class ClientBoundaryError extends KeylessError {
  override readonly name = "ClientBoundaryError";
  constructor() {
    super(
      "Keyless was instantiated in a browser environment. Secrets must only be accessed server-side.",
    );
  }
}
