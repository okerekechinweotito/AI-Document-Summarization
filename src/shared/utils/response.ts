export const formatSuccess = (
  data: any = {},
  message: any = {},
  statusCode = 200
) => {
  return {
    statusCode,
    message,
    data: data ?? {},
  };
};

export const formatError = (
  message: any = {},
  statusCode = 500,
  data: any = {}
) => {
  return {
    statusCode,
    message,
    data: data ?? {},
  };
};

export default { formatSuccess, formatError };
