/** Returns a static health payload. Placeholder to prove the toolchain works. */
export function health(): { status: 'ok'; service: string } {
  return { status: 'ok', service: 'ppg-pulse-server' };
}
