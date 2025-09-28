export function getAllowedOrigins(): string[] {
  const env = process.env.NODE_ENV;

  if (env === 'production') {
    return [
      'http://192.168.1.1:4200',
      'https://stock-checker-supreme.netlify.app/',
    ];
  } else if (env === 'staging') {
    return [
      'https://stock-checker-supreme.netlify.app/',
      'capacitor://localhost',
    ];
  } else {
    return ['http://localhost:4200', 'http://127.0.0.1:4200'];
  }
}

export function corsOptionsDelegate(origin: string | undefined, callback: any) {
  const allowedOrigins = getAllowedOrigins();

  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
}
