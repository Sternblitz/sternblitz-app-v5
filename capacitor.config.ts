import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sternblitz.app',
  appName: 'Sternblitz Sales',
  webDir: 'out',
  server: {
    url: 'https://sternblitz-app-v5-w8qg.vercel.app/login', // TODO: Update with your actual Vercel URL
    cleartext: true
  }
};

export default config;
