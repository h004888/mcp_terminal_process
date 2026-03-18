export const config = {
  logsDir: "logs",
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxRotatedFiles: 5,
  killTimeout: 5000, // 5s before SIGKILL
};
