// Bound waits for network/auth operations that may never settle on a device.
export async function withTimeout(operation, milliseconds = 15000) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Connection timed out. Check your internet connection and try again.')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
