import os
import tempfile
import asyncio
import hashlib
import json
import logging
import wave
from typing import List, Dict, Any
from fastapi import HTTPException

# Configure logging
logger = logging.getLogger("acumen.audio_generator")

# We use the new google-genai SDK for premium multi-speaker TTS
try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except ImportError:
    HAS_GENAI_SDK = False
    logger.warning("google-genai SDK not available. TTS will fall back to legacy models.")

# Fallback models in case Gemini is unavailable or key is missing
TTS_FALLBACK_MODELS = [
    "espnet/kan-bayashi_ljspeech_vits",
    "facebook/fastspeech2-en-ljspeech",
    "facebook/mms-tts-eng"
]

def get_script_hash(script: List[Dict[str, str]]) -> str:
    """Compute SHA-256 hash of the script text to support content-addressed caching."""
    script_str = json.dumps(script, sort_keys=True)
    return hashlib.sha256(script_str.encode("utf-8")).hexdigest()

def concatenate_wav_files(file_list: List[str], output_path: str) -> None:
    """Concatenate multiple WAV files with identical formats in pure Python."""
    if not file_list:
        raise ValueError("WAV file list is empty")
    
    logger.info("Concatenating %d WAV files into: %s", len(file_list), output_path)
    
    with wave.open(file_list[0], 'rb') as first_file:
        params = first_file.getparams()
        
    with wave.open(output_path, 'wb') as output_file:
        output_file.setparams(params)
        for file_path in file_list:
            with wave.open(file_path, 'rb') as wav_in:
                output_file.writeframes(wav_in.readframes(wav_in.getnframes()))

async def synthesize_line_gemini(client: Any, text: str, voice_name: str) -> bytes:
    """Synthesize speech for a single line using Gemini generate_content audio modality."""
    # Ensure standard Gemini TTS configuration
    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name
                )
            )
        )
    )
    
    # Run the client call in the default executor to prevent event loop blocking
    loop = asyncio.get_running_loop()
    response = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
            model="gemini-3.1-flash-tts-preview",
            contents=text,
            config=config
        )
    )
    
    audio_bytes = None
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            audio_bytes = part.inline_data.data
            break
            
    if not audio_bytes:
        raise ValueError("Gemini did not return inline audio data for the requested TTS line.")
        
    return audio_bytes

async def generate_podcast_audio(script: List[Dict[str, str]], session_id: str) -> str:
    """
    Synthesizes a dual-host podcast audio overview from a dialogue script.
    - Host A uses voice 'Aoede' (warm female voice).
    - Host B uses voice 'Puck' (casual energetic male voice).
    - Uses content-addressed caching to avoid redundant API charges and latency.
    - Fallbacks to serverless HuggingFace TTS if Gemini is unconfigured.
    """
    data_dir = os.environ.get("ACUMEN_DATA_DIR", "./data")
    cache_dir = os.path.join(data_dir, "audio_cache")
    os.makedirs(cache_dir, exist_ok=True)
    
    # 1. Content-addressed Caching check
    script_hash = get_script_hash(script)
    cached_file_path = os.path.join(cache_dir, f"{script_hash}.wav")
    
    if os.path.exists(cached_file_path):
        logger.info("Cache HIT! Returning pre-synthesized audio: %s", cached_file_path)
        return cached_file_path
        
    logger.info("Cache MISS. Synthesizing podcast audio for session: %s", session_id)
    
    api_key = os.getenv("GOOGLE_API_KEY")
    
    # 2. Check if we can use premium Gemini TTS
    if HAS_GENAI_SDK and api_key:
        try:
            client = genai.Client(api_key=api_key)
            temp_files = []
            
            # Synthesize each conversational line in order
            for i, line in enumerate(script):
                host = line.get("host", "A").upper()
                text = line.get("text", "")
                
                # Match host with designated prebuilt voice
                voice_name = "Aoede" if host == "A" else "Puck"
                logger.info("Synthesizing line %d (Host %s) with voice %s...", i + 1, host, voice_name)
                
                audio_bytes = await synthesize_line_gemini(client, text, voice_name)
                
                # Save each line to a temporary file
                temp_dir = os.path.join(data_dir, "temp")
                os.makedirs(temp_dir, exist_ok=True)
                line_file_path = os.path.join(temp_dir, f"{session_id}_line_{i}.wav")
                
                with open(line_file_path, "wb") as f:
                    f.write(audio_bytes)
                temp_files.append(line_file_path)
                
            # Concatenate all lines together into a single premium WAV
            concatenate_wav_files(temp_files, cached_file_path)
            
            # Clean up individual line WAV segments
            for fpath in temp_files:
                try:
                    os.remove(fpath)
                except Exception:
                    pass
                    
            logger.info("Successfully generated premium dual-host podcast to: %s", cached_file_path)
            return cached_file_path
            
        except Exception as gemini_err:
            logger.warning("Premium Gemini TTS synthesis failed: %s. Falling back to serverless HF TTS...", gemini_err)
            
    # 3. Fallback strategy (Hugging Face serverless TTS API)
    hf_api_key = os.getenv("HUGGINGFACE_API_KEY")
    if not hf_api_key:
        logger.error("Both Gemini API key and HUGGINGFACE_API_KEY are missing.")
        raise HTTPException(status_code=500, detail="TTS API Keys missing. Configure GOOGLE_API_KEY to enable premium audio.")
        
    try:
        from huggingface_hub import InferenceClient
        client = InferenceClient(api_key=hf_api_key)
        loop = asyncio.get_running_loop()
        
        # Hugging Face TTS fallback handles a single flat text block
        flat_text = " ".join([line.get("text", "") for line in script])
        logger.info("Attempting Hugging Face fallback TTS synthesis...")
        
        last_error = None
        for model_id in TTS_FALLBACK_MODELS:
            try:
                logger.info("Attempting HF TTS with model: %s", model_id)
                audio_data = await loop.run_in_executor(
                    None,
                    lambda: client.text_to_speech(flat_text, model=model_id)
                )
                
                with open(cached_file_path, "wb") as f:
                    f.write(audio_data)
                    
                logger.info("Success! Saved fallback audio to: %s", cached_file_path)
                return cached_file_path
            except Exception as e:
                logger.warning("HF TTS failed for model %s: %s", model_id, e)
                last_error = e
                continue
                
        raise last_error if last_error else RuntimeError("All HF TTS fallback models failed")
        
    except Exception as fallback_err:
        logger.critical("All audio overview synthesis paths failed: %s", fallback_err)
        raise HTTPException(
            status_code=502, 
            detail=f"Audio overview synthesis failed. Config/keys missing or APIs unreachable: {str(fallback_err)}"
        )
