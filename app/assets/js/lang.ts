export function assertUnreachable(_: never): never {
  throw new Error('should be unreachable');
}

export function fail(): never {
  throw new Error('should never be called');
}
