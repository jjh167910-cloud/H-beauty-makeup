#!/usr/bin/env bash
# The GPU pilot in one command (on a rented Linux machine with an 80 GB NVIDIA GPU, e.g. RunPod A100).
# Runs in the background: closing the browser or locking the phone doesn't stop it.
# SKIP_FLUX=1 runs only Qwen-Image-Edit-2511 (no Hugging Face login needed).
set -euo pipefail
KIT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$KIT"
echo "GPU:"; nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true
FREE=$(df -BG --output=avail "${HF_HOME:-$HOME}" | tail -1 | tr -dc 0-9)
NEED=$([ "${SKIP_FLUX:-0}" = 1 ] && echo 75 || echo 130)
if [ "${FREE:-0}" -lt "$NEED" ]; then echo "Only ${FREE} GB disk free; the AI models need ~${NEED} GB. Give the machine 200 GB of disk and start again."; exit 1; fi
echo "Installing (1-2 min)…"
pip install -q -U diffusers transformers accelerate peft safetensors huggingface_hub hf_transfer mediapipe opencv-python-headless pillow
export HF_HUB_ENABLE_HF_TRANSFER=1
TEACHERS=flux3,qwen
if [ "${SKIP_FLUX:-0}" = 1 ]; then TEACHERS=qwen
elif ! hf auth whoami >/dev/null 2>&1; then
  cat <<'MSG'

FLUX 3 Image Klein is gated: it needs your own Hugging Face login on this machine (once).
  1. On huggingface.co, open black-forest-labs/flux-3-image-klein and accept its terms.
  2. Settings -> Access Tokens -> Create new token (type: Read). Copy it.
  3. Here, run:  hf auth login   and paste the token (it stays on this machine).
Then run this command again. Or run only the other model:  SKIP_FLUX=1 bash hb-gpu-kit/scripts/gpu/run_pilot.sh
MSG
  exit 1
fi
nohup bash -c "python scripts/gpu/pilot.py --teachers $TEACHERS --out '$KIT/results' && cp '$KIT/results.zip' '$KIT/../pilot-results.zip' && echo 'ALL DONE: download pilot-results.zip'" > "$KIT/pilot.log" 2>&1 &
echo "Started ($TEACHERS). Progress below (Ctrl+C or closing the page only stops this view, not the run):"
sleep 2; tail -f "$KIT/pilot.log"
