export function errorExistsInLog(reason: any, errorMessage: string) {
  if (!reason.logs) {
    throw new Error("logs not found");
  }
  const logs = reason.logs as string[];
  for (const log of logs) {
    if (log.includes(errorMessage)) {
      return true;
    }
  }
  return false;
}
