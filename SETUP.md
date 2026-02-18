# Ghost Scribe - Setup Guide

Audio transcription app with WhisperX, speaker diarization, FTS5 search, and synchronized playback.

## Target Machine

- **Host:** Blackbird (Ryzen 9700X, 64GB RAM, RTX 3090)
- **Deploy to:** `/home/tom/blackbird_dev/ghost-scribe`

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.9 with pip
- **CUDA** toolkit (for GPU transcription)
- **HuggingFace token** (free, for speaker diarization)

## Installation

### 1. Clone and install Node dependencies

```bash
cd /home/tom/blackbird_dev
git clone <repo-url> ghost-scribe
cd ghost-scribe
npm install
cd client && npm install && cd ..
```

### 2. Install Python dependencies (WhisperX)

```bash
# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install PyTorch with CUDA support for RTX 3090
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install WhisperX
pip install git+https://github.com/m-bain/whisperx.git
```

### 3. Set up HuggingFace token for diarization

Speaker diarization requires a HuggingFace token (free account):

1. Sign up at https://huggingface.co
2. Accept the pyannote model terms:
   - https://huggingface.co/pyannote/segmentation-3.0
   - https://huggingface.co/pyannote/speaker-diarization-3.1
3. Get your token from https://huggingface.co/settings/tokens
4. Set it:

```bash
export HF_TOKEN=hf_your_token_here
```

Or copy the example environment file and edit it:
```bash
cp .env.example .env
# Edit .env and paste your HuggingFace token
```

The `.env` file is automatically loaded by both the Node.js server and the Python transcription script. You can also configure `PORT` and `AUTH_PASSWORD` in this file. See `.env.example` for all available options.

## Running

### Development mode (both server + client with hot-reload)

```bash
npm run dev
```

- **Server:** http://localhost:3001
- **Client:** http://localhost:5173 (proxies API to server)

### Production mode

```bash
npm run build         # Build the React client
npm run server        # Start the server (serves both API and built client)
```

Then open http://localhost:3001

## Usage

1. **Upload audio** - Drag & drop audio files (MP3, WAV, FLAC, M4A, etc.) onto the dashboard
2. **Transcription starts automatically** - WhisperX runs on your RTX 3090 with diarization
3. **View transcript** - Click a completed recording to see the synced transcript
4. **Click any segment** to jump the audio player to that timestamp
5. **Search** - Use the global search bar or per-transcript search; results jump to audio + text
6. **Rename speakers** - Click any speaker label in the transcript or sidebar to rename
7. **Export** - Download as PDF, Word (.docx), or Markdown

## Architecture

```
ghost-scribe/
├── server/
│   ├── index.js              # Express server entry point
│   ├── database.js           # SQLite + FTS5 schema
│   ├── routes/recordings.js  # REST API endpoints
│   └── services/
│       ├── transcription.js  # WhisperX Python bridge
│       └── exporter.js       # PDF/DOCX/MD export
├── client/
│   └── src/
│       ├── components/       # React UI components
│       ├── utils/            # API client, formatters
│       └── styles/           # Global CSS
├── scripts/
│   ├── transcribe.py         # WhisperX worker script
│   └── requirements.txt      # Python dependencies
├── uploads/                  # Audio files (gitignored)
└── data/                     # SQLite database (gitignored)
```

## Key Features

- **WhisperX** with large-v3 model for best quality transcription
- **RTX 3090 GPU acceleration** with float16 compute
- **Speaker diarization** via pyannote (identifies who is speaking)
- **Word-level timestamps** for precise audio-text sync
- **FTS5 full-text search** with Porter stemming across all transcripts
- **WaveSurfer.js** waveform audio player with playback speed control
- **Auto-scrolling transcript** follows audio playback position
- **Speaker renaming** persists through the entire transcript
- **Export** to PDF, Word, and Markdown with speaker labels and timestamps
