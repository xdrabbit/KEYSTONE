#!/usr/bin/env python3
"""
WhisperX transcription worker for Ghost Scribe.
Runs WhisperX with speaker diarization and word-level alignment,
outputs structured JSON for import into the app database.

Requirements:
    pip install whisperx torch torchaudio

For diarization you need a HuggingFace token:
    export HF_TOKEN=your_huggingface_token

Usage:
    python3 transcribe.py --audio /path/to/audio.mp3 --recording-id abc123 --output-json /path/to/output.json
"""

import argparse
import json
import sys
import os
import time


def progress(message):
    """Send progress message to parent process via stdout."""
    print(json.dumps({"type": "progress", "message": message}), flush=True)


def main():
    parser = argparse.ArgumentParser(description="WhisperX transcription worker")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--recording-id", required=True, help="Recording ID")
    parser.add_argument("--output-json", required=True, help="Output JSON file path")
    parser.add_argument("--model", default="large-v3", help="Whisper model size")
    parser.add_argument("--language", default=None, help="Language code (auto-detect if not set)")
    parser.add_argument("--device", default="cuda", help="Device: cuda or cpu")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size for transcription")
    parser.add_argument("--compute-type", default="int8_float16", help="Compute type: float16, int8, int8_float16, etc.")
    parser.add_argument("--hf-token", default=None, help="HuggingFace token for diarization")
    parser.add_argument("--min-speakers", type=int, default=None, help="Min speakers for diarization")
    parser.add_argument("--max-speakers", type=int, default=None, help="Max speakers for diarization")
    args = parser.parse_args()

    hf_token = args.hf_token or os.environ.get("HF_TOKEN")

    if not os.path.exists(args.audio):
        print(f"Error: Audio file not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    progress("Loading WhisperX model...")

    try:
        import whisperx
        import torch
    except ImportError as e:
        print(f"Error: Missing dependency: {e}", file=sys.stderr)
        print("Install with: pip install whisperx torch torchaudio", file=sys.stderr)
        sys.exit(1)

    device = args.device
    if device == "cuda" and not torch.cuda.is_available():
        progress("CUDA not available, falling back to CPU")
        device = "cpu"
        compute_type = "int8"
    else:
        compute_type = args.compute_type

    # Step 1: Load and transcribe
    progress(f"Loading model '{args.model}' on {device}...")
    model = whisperx.load_model(
        args.model,
        device,
        compute_type=compute_type,
        language=args.language,
    )

    progress("Loading audio...")
    audio = whisperx.load_audio(args.audio)

    progress("Transcribing audio...")
    start_time = time.time()
    result = model.transcribe(audio, batch_size=args.batch_size)
    elapsed = time.time() - start_time
    progress(f"Transcription complete ({elapsed:.1f}s)")

    detected_language = result.get("language", args.language or "en")
    progress(f"Detected language: {detected_language}")

    # Free transcription model VRAM before loading alignment model
    import gc
    del model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()
    progress("Released transcription model from VRAM")

    # Step 2: Align word-level timestamps
    progress("Aligning word-level timestamps...")
    try:
        align_model, align_metadata = whisperx.load_align_model(
            language_code=detected_language, device=device
        )
        result = whisperx.align(
            result["segments"], align_model, align_metadata, audio, device,
            return_char_alignments=False,
        )
        progress("Word alignment complete")

        # Free alignment model before diarization
        del align_model, align_metadata
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
    except Exception as e:
        progress(f"Word alignment failed (continuing without): {e}")

    # Step 3: Speaker diarization
    if hf_token:
        progress("Running speaker diarization...")
        try:
            # whisperx 3.8+ moved DiarizationPipeline to whisperx.diarize
            try:
                from whisperx.diarize import DiarizationPipeline
            except ImportError:
                DiarizationPipeline = whisperx.DiarizationPipeline
            diarize_model = DiarizationPipeline(
                use_auth_token=hf_token, device=device
            )
            diarize_kwargs = {}
            if args.min_speakers is not None:
                diarize_kwargs["min_speakers"] = args.min_speakers
            if args.max_speakers is not None:
                diarize_kwargs["max_speakers"] = args.max_speakers

            diarize_segments = diarize_model(audio, **diarize_kwargs)
            result = whisperx.assign_word_speakers(diarize_segments, result)
            progress("Speaker diarization complete")

            # Free diarization model
            del diarize_model, diarize_segments
            gc.collect()
            if device == "cuda":
                torch.cuda.empty_cache()
        except Exception as e:
            progress(f"Diarization failed (continuing without): {e}")
    else:
        progress("Skipping diarization (no HF_TOKEN set)")

    # Step 4: Build output JSON
    progress("Building output...")
    segments = result.get("segments", [])
    output = {
        "language": detected_language,
        "segments": [],
    }

    for seg in segments:
        segment_data = {
            "start": round(seg.get("start", 0), 3),
            "end": round(seg.get("end", 0), 3),
            "text": seg.get("text", "").strip(),
            "speaker": seg.get("speaker", None),
            "confidence": None,
            "words": [],
        }

        for w in seg.get("words", []):
            # WhisperX word entries may not always have start/end
            if "start" in w and "end" in w:
                segment_data["words"].append({
                    "word": w.get("word", ""),
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                    "score": round(w.get("score", 0), 3),
                    "speaker": w.get("speaker", seg.get("speaker", None)),
                })

        output["segments"].append(segment_data)

    # Write output JSON
    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    progress(f"Output written to {args.output_json}")
    progress(f"Total segments: {len(output['segments'])}")

    # Final VRAM cleanup
    if device == "cuda":
        gc.collect()
        torch.cuda.empty_cache()

    progress("Done!")


if __name__ == "__main__":
    main()
