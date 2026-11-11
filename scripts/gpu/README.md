# Free test on Kaggle (start here)

`free_test.py` runs **FLUX 3 Image Klein** on Kaggle's free 16 GB GPU (float16, parts moved on and off
the GPU, no prompt upsampler) on the 3 hardest looks x 4 synthetic faces, and, with a Gemini API key,
the same 12 with **Nano Banana 2.1** (about $0.50) to compare. It also measures how long FLUX 3 takes
per image on the free GPU, to plan a free full run. `free_test_kaggle.ipynb` is the notebook.

1. **huggingface.co**: open `black-forest-labs/flux-3-image-klein`, accept its terms; *Settings → Access
   Tokens* → new **Read** token. (Optional) **aistudio.google.com** → *Get API key* for Nano Banana.
2. **kaggle.com** (verify your phone number once): *Create → New Dataset* → upload `hb-gpu-kit.zip`
   (title e.g. `hb-gpu-kit`) → *Create*.
3. *Create → New Notebook* → *File → Import Notebook* → `free_test_kaggle.ipynb`.
4. Right panel: *Session options* → **GPU T4 x2**, **Internet on**; *Add Input* → your `hb-gpu-kit`
   dataset; *Add-ons → Secrets* → add **HF_TOKEN** (and **GEMINI_API_KEY**), switch them on.
5. **Save Version → Save & Run All**. ~40–60 minutes in the background; you can close the page.
6. Open the finished version → *Output* → download **test-results.zip** and send it in the chat.

Without a GPU, `python scripts/gpu/free_test.py --dry-run` tests the script with the phone engine
standing in for both AIs.

# Paid GPU pilot: which big AI editor is the best teacher for the phone model?

The app stays fully offline. A rented GPU is used only for **training**: the best AI image editor we
may legally use puts each catalog look onto synthetic faces, and a small network learns to do the
same inside the app. This pilot compares the strongest candidates **at full quality** before paying
for the full run (about $3, ~1.5 hours on an A100 80GB):

- **FLUX 3 Image Klein** (Black Forest Labs, Oct 2026): the #3 open model for image editing, and the
  best one a small business may use (free commercial use under US$5M yearly revenue; its outputs may
  not train a *competing image model*). Recommended settings: 16 steps with its prompt upsampler.
- **Qwen-Image-Edit-2511** (Alibaba, Apache-2.0, no conditions): 40 steps, true CFG 4. Slower, so
  it runs on 4 looks x 4 faces.

(Fibo 2.0 and Qwen-Image-2.1 rank slightly higher, but their licences are research / non-commercial
only.) Faces are synthetic (SFHQ-T2I, no real people). One sheet per look:

    face | phone engine today | FLUX 3 makeup only | Qwen makeup only | FLUX 3 as drawn | Qwen as drawn

## Steps (all from a phone browser)

1. **huggingface.co** (free account): open `black-forest-labs/flux-3-image-klein` and accept its
   terms. Then *Settings → Access Tokens → Create new token* (type **Read**) and copy it.
2. **runpod.io** → sign up → *Billing* → add $10 credit.
3. *Pods* → **Deploy**. GPU: **A100 80GB** (SXM or PCIe; *Community Cloud* is cheaper; an H100 80GB
   also works). Template: **RunPod PyTorch**. Tap **Edit Template** → *Container Disk* = **200 GB** →
   *Set Overrides* → **Deploy On-Demand**.
4. When the pod is *Running*: **Connect** → **Jupyter Lab** (port 8888).
5. In Jupyter, tap **upload** (arrow up, above the file list) and pick `hb-gpu-kit.zip`.
6. *File → New → Terminal*, then type (paste your token when asked; it stays on that machine):

       hf auth login
       unzip -q hb-gpu-kit.zip && bash hb-gpu-kit/scripts/gpu/run_pilot.sh

   (If you'd rather skip FLUX 3: `SKIP_FLUX=1 bash hb-gpu-kit/scripts/gpu/run_pilot.sh`, no login.)
   It installs, downloads both models (~105 GB, 10–20 minutes) and starts; each finished image
   prints a line. You can lock the phone or close the page: it keeps running. To look again, open
   Jupyter and run `tail -f hb-gpu-kit/pilot.log`.
7. When the log ends with **ALL DONE**: in the file list, long-press **pilot-results.zip** →
   *Download*, and send it in the chat. If something fails, send `hb-gpu-kit/pilot.log` instead.
8. In RunPod: **Stop**, then **Terminate** the pod, so it stops costing money.

## What the numbers mean

- `drift`: how far the AI moved the face, in eye widths. Below ~0.03 is the same face.
- `dE`: how much it changed the skin colour outside the makeup (Lab). Below ~3 is hard to see.
- "Makeup only" keeps the face's own pixels and takes only the makeup, so drift and skin changes
  can't reach the result. That is what the phone model would learn.

Without a GPU, `python scripts/gpu/pilot.py --dry-run` runs everything with the phone engine standing
in for the AI (to test the script). The kit is the repo files the script needs plus 12 synthetic
faces in `scripts/gpu/faces/` (not committed).
