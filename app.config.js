// app.config.js - exposes build-time env vars into expo `extra` safely
export default ({ config }) => {
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      // DEEPGRAM_API_KEY will be injected at build time by EAS when you
      // configure the variable (via eas env or the Expo dashboard).
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    },
  };
};
