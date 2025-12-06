export const customLogger = (err: any, location: string) => {
  const logMessage = `[${new Date().toISOString()}] Error at ${location}: ${
    err.stack || err
  }\n`;
  console.error(logMessage);
};
