export function explainBackendError(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("connection refused")
  ) {
    return [
      "Backend request failed.",
      "Check that the backend process is running and that the configured base URL, host, and port are correct.",
      message
    ].join("\n");
  }

  if (
    normalizedMessage.includes("model_path") ||
    normalizedMessage.includes("model path") ||
    normalizedMessage.includes("no such file") ||
    normalizedMessage.includes("not found")
  ) {
    return [
      "A configured model or file path could not be found.",
      "Check the selected model paths in the backend configuration.",
      message
    ].join("\n");
  }

  if (
    normalizedMessage.includes("cuda") ||
    normalizedMessage.includes("out of memory") ||
    normalizedMessage.includes("oom")
  ) {
    return [
      "The runtime reported a GPU/CUDA error.",
      "Try reducing context size, image dimensions, batch size, or GPU layer count.",
      message
    ].join("\n");
  }

  if (
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("timed out")
  ) {
    return [
      "The backend operation timed out.",
      "Increase the relevant timeout setting or check whether the model is still loading.",
      message
    ].join("\n");
  }

  return message;
}
