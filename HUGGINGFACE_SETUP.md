Hugging Face token configuration for AI Yoto

Set the following server environment variables in the hosting dashboard (or in a local, untracked .env.local file):

  HUGGINGFACE_API_KEY=your_huggingface_token
  HUGGINGFACE_MODEL=deepseek-ai/DeepSeek-V3-0324
  HUGGINGFACE_BASE_URL=https://router.huggingface.co/v1

The server also accepts HF_TOKEN as a fallback for HUGGINGFACE_API_KEY. Never commit either token or expose it in browser code.

Chat, chapter organization, and icon generation use the Hugging Face Inference Providers OpenAI-compatible endpoint. Audio transcription still uses Gemini because the configured DeepSeek V3 chat model is text-only; transcription therefore also requires the server variable GOOGLE_GENERATIVE_AI_API_KEY.
