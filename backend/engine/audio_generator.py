import os
import requests
import tempfile
import asyncio
from fastapi.responses import FileResponse
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

from huggingface_hub import InferenceClient

# We use multiple models as fallbacks in case one is down or unavailable via serverless API
TTS_MODELS = [
    "espnet/kan-bayashi_ljspeech_vits",
    "facebook/fastspeech2-en-ljspeech",
    "facebook/mms-tts-eng"
]

async def generate_podcast_audio(text: str, session_id: str) -> str:
    """
    Synthesize speech using Hugging Face InferenceClient.
    Uses a fallback strategy across multiple reliable TTS models.
    """
    api_key = os.getenv("HUGGINGFACE_API_KEY")
    if not api_key:
        logger.error("HUGGINGFACE_API_KEY is not set.")
        raise HTTPException(status_code=500, detail="TTS API Key missing")

    client = InferenceClient(api_key=api_key)
    loop = asyncio.get_running_loop()

    last_error = None
    for model_id in TTS_MODELS:
        try:
            logger.info("Attempting TTS with model: %s", model_id)
            # Run the synchronous client call in a threadpool
            audio_data = await loop.run_in_executor(
                None, 
                lambda: client.text_to_speech(text, model=model_id)
            )
            
            # Determine a safe temp directory across OS
            tmp_dir = "/tmp" if os.name != "nt" else tempfile.gettempdir()
            if not os.path.exists(tmp_dir):
                os.makedirs(tmp_dir, exist_ok=True)
                
            file_path = os.path.join(tmp_dir, f"{session_id}_podcast.wav")
            
            with open(file_path, "wb") as f:
                f.write(audio_data)
                
            logger.info("Success! Saved podcast audio from %s to: %s", model_id, file_path)
            return file_path
        except Exception as e:
            logger.warning("TTS failed for model %s: %s", model_id, e)
            last_error = e
            continue

    logger.error("All TTS fallback models failed. Last error: %s", last_error)
    raise HTTPException(status_code=502, detail=f"TTS Generation failed across all models: {str(last_error)}")
