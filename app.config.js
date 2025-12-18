// app.config.js - exposes build-time env vars into expo `extra` safely
export default ({ config }) => {
  return {
    ...config,

    plugins: [
      ...(config.plugins || []),
      "expo-audio",
    ],

    extra: {
      ...(config.extra || {}),
      // Injected at build time by EAS
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    },
  };
};
