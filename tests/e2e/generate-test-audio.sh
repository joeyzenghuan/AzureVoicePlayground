#!/bin/bash
# Generate test audio for Playwright conversation tests
# Requires: macOS `say` + `sox` (brew install sox)
#
# Output: /tmp/combined_speech_48k.wav
#   Contains two speech segments separated by silence:
#     1. "Hello, can you hear me? I'm testing the voice translator."
#     2. "The weather today is very nice. I would like to go for a walk in the park."

set -e

echo "Generating speech segments with macOS TTS..."
say -o /tmp/speech1.aiff "Hello, can you hear me? I'm testing the voice translator."
say -o /tmp/speech2.aiff "The weather today is very nice. I would like to go for a walk in the park."

echo "Converting to 16kHz PCM WAV..."
sox /tmp/speech1.aiff -r 16000 -c 1 -b 16 -e signed-integer /tmp/speech1.wav
sox /tmp/speech2.aiff -r 16000 -c 1 -b 16 -e signed-integer /tmp/speech2.wav

echo "Creating 5s silence..."
sox -n -r 16000 -c 1 -b 16 -e signed-integer /tmp/silence5s.wav trim 0.0 5.0

echo "Concatenating: speech1 + silence + speech2 + silence..."
sox /tmp/speech1.wav /tmp/silence5s.wav /tmp/speech2.wav /tmp/silence5s.wav /tmp/combined_speech.wav

echo "Resampling to 48kHz for Chromium compatibility..."
sox /tmp/combined_speech.wav -r 48000 -c 1 -b 16 /tmp/combined_speech_48k.wav

echo ""
echo "Audio file info:"
sox --i /tmp/combined_speech_48k.wav
echo ""
echo "Done! Output: /tmp/combined_speech_48k.wav"
