# AI Slop Detector 🔍  
Detect AI-generated text — fully local, fully private.

*A fine-tuned 270M Q4-quantized model running entirely in your browser using Wllama on CPU. No API keys. No cloud. No data leakage.*

## Performance

### 📊 Model Comparison

| Model                       | Parameters | Test Accuracy | Precision |
|-----------------------------|------------|---------------|-----------|
| GPT OSS 120B (teacher)      | ~120B      | 100%          | 100%      |
| Gemma 3 270M (base)         | 270M       | ~40%          | ~55%      |
| Gemma 3 270M (tuned)        | 270M       | 100%          | 100%      |
| Gemma 3 270M Q4 (quantized) | 270M       | ~95%          | ~95%      |

The tuned model matches the teacher while being **over 400× smaller** and running entirely in your browser.

## Quick Start

### 1. Download the extension files
```bash
git clone https://github.com/Priyansurout/ai-slop-detector.git
cd ai-slop-detector
```
### 2. Load the extension in Chrome

1. Open `chrome://extensions/` in your browser.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the extension folder.

### 3. First use

1. Click the 🔍 icon in your browser toolbar.
2. Wait for the model to download (~253 MB).  
   _The model is cached after the first load._
3. Paste your text and click **Analyze**.

That’s it! 🎉  
The model runs entirely in your browser — **no data ever leaves your machine**.

## The Problem & The Goal

AI-generated “slop” is flooding the internet, blurring the line between human writing and machine-generated content.

The goal of this project is to build a small, fast, fully local model that accurately detects AI slop without sending data to the cloud or compromising user privacy.

## Training Pipeline

The model was trained using **Distil Labs** via **knowledge distillation**, where a large teacher model supervises a smaller student model.

### Step 1: Create a Model in Distil Labs
Create a new model in Distil Labs:

```bash
distil model create ai-slop-detector
```
### Step 2: Prepare Your Data Files

Create a dataset folder containing the following files:

- `job_description.json`
- `config.yaml`
- `train.csv` — Training examples
- `test.csv` — Evaluation examples

You need **at least 20 labeled examples** to get started.

#### Example `train.csv` format

```csv
question,answer
"lmao no way that actually worked 😂 you're a genius thanks so much!!!",human_written
"We recognize the value of your feedback and remain committed to continuous improvement. Your satisfaction is our top priority.",ai_generated
```
### Step 3: Upload Your Data
Once all files are ready (e.g., in `ai-slop-detector-data/`), upload them to Distil Labs:

```bash
distil model upload-data <model-id> --data ./ai-slop-detector-data
```
### Step 4: Run Teacher Evaluation
Before training the student model, validate that the task is learnable:
```bash
distil model run-teacher-evaluation <model-id>
```
Check the results:
```bash
distil model teacher-evaluation <model-id>
```

### Step 5: Train the Student Model
Start training:
```bash
distil model run-training <model-id>
```
Monitor training progress:
```bash
distil model training <model-id>
```

### Step 6: Download and Deploy
Once training completes, download the trained model:
```bash
distil model download <model-id>
```

## Evaluation and Results

### Test Methodology

The model was evaluated at multiple levels to assess both general accuracy and robustness across difficulty levels.

---

### 1. Held-Out Test Set (10 examples)

- **Balanced**: 5 AI-generated, 5 human-written
- **Never seen during training**
- Covers **typical real-world cases**

**Results:**

- **Student Model Accuracy**: 100%

| Class           | Precision | Recall | F1-Score |
|-----------------|-----------|--------|----------|
| AI-generated    | 100%      | 100%   | 100%     |
| Human-written   | 100%      | 100%   | 100%     |

---

### 2. Extended Test Suite (20 examples)

Examples were categorized by difficulty to test robustness.

| Difficulty | Description            | Examples | Accuracy        |
|-----------|------------------------|----------|-----------------|
| Easy      | Obvious AI markers     | 6        | 100% (6/6)     |
| Medium    | Subtle differences     | 8        | 100% (8/8)     |
| Hard      | Edge cases             | 6        | 83% (5/6)      |

**Overall Extended Test Accuracy:** **95% (19/20)**

---


### 3. Quantized Model (Q4_K_M)

After quantization to **Q4 precision**, the model achieves a strong balance between size, speed, and accuracy.

- **Model size**: 242 MB  
- **Size reduction**: ~78% (1.1 GB → 242 MB)  
- **Accuracy retention**: ~95% (minimal degradation compared to full precision)  
- **Inference speed**: ~0.5–2 seconds per query on consumer CPUs  

This makes the quantized model suitable for **fully local, in-browser inference** without sacrificing practical performance.

---

### Real-World Performance

Informal testing was conducted on diverse, real-world text sources to evaluate robustness beyond curated test sets.

| Content Type       | Sample Size | Accuracy |
|--------------------|-------------|----------|
| Reddit comments    | 100+        | ~92%     |
| ChatGPT outputs    | 50          | 98%      |
| Human tweets       | 50          | 94%      |
| Formal emails      | 30          | 88%      |

## FAQ

### Q: Is my text sent to any server?
**A:** No. The model is downloaded once from Hugging Face (~253 MB) and then runs entirely in your browser. Your text **never leaves your machine**.

---

### Q: Why does the first load take so long?
**A:** On first use, the browser downloads and caches the model file (~253 MB).  
Once cached, subsequent launches are **near-instant**.

---

### Q: Why is the model so small (242 MB) compared to ChatGPT?
**A:** This project uses **knowledge distillation** to compress a very large teacher model (**GPT OSS 120B**) into a much smaller student model (**Gemma 3 270M**), while retaining most of the performance.

The student model is then **quantized to 4-bit (Q4)**, dramatically reducing size with minimal accuracy loss.

---

### Q: Can I use this offline?
**A:** Yes — this is one of the key advantages.

- ✅ **100% offline** after the initial download  
- ✅ **Privacy-first** — no data ever leaves your device  
- ✅ **Fast** — ~0.5–2 seconds per query on consumer CPUs  
- ✅ **Free** — no API costs or rate limits  

---

### Q: What model architecture is used?
**A:** The detector is based on **`google/gemma-3-270m-it`**, fine-tuned for AI-text detection and **quantized to 4-bit** for efficient, fully in-browser CPU inference using Wllama.












