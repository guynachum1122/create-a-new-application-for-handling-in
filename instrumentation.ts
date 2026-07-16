export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DD_API_KEY) {
    const tracer = await import('dd-trace');
    tracer.default.init({
      service: process.env.DD_SERVICE || 'coverpath',
      env: process.env.DD_ENV || process.env.NODE_ENV,
      logInjection: true,
    });
  }
}
