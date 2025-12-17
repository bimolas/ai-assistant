// app.config.js
export default ({ config }) => {
  return {
    ...config,
    extra: {
      ...config.extra,
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    },
  };
};