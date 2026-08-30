"""
SafeScreen — Fine-tune dslim/distilbert-base-NER on a PII-specific corpus.

Base model : dslim/distilbert-base-NER   (CoNLL-2003, F1 91.4%)
Objective  : Boost recall on PII entity types that CoNLL-2003 underrepresents:
             SSN fragments, credit-card holders, membership IDs, health-record names.

Usage:
  pip install transformers datasets seqeval accelerate optimum onnx
  python scripts/finetune_ner.py

Output:
  models/pii-ner-finetuned/   — HuggingFace checkpoint
  models/pii-ner-onnx/        — ONNX export ready for Transformers.js

The ONNX folder can be loaded directly by the extension:
  pipeline('token-classification', './models/pii-ner-onnx', { quantized: true })
"""

import json, os
from datasets import Dataset, DatasetDict
from transformers import (
    AutoTokenizer, AutoModelForTokenClassification,
    TrainingArguments, Trainer, DataCollatorForTokenClassification
)
import numpy as np
from seqeval.metrics import classification_report, f1_score

# ---------------------------------------------------------------------------
# 1. PII Fine-Tuning Corpus
#    Format: list of {"tokens": [...], "ner_tags": [...]} where tags follow
#    the CoNLL-2003 IOB2 scheme: O, B-PER, I-PER, B-LOC, I-LOC, B-ORG, I-ORG
#
#    Add your own annotated examples here, or load from a JSONL file.
# ---------------------------------------------------------------------------

LABEL_LIST = ["O", "B-PER", "I-PER", "B-LOC", "I-LOC", "B-ORG", "I-ORG", "B-MISC", "I-MISC"]
LABEL2ID   = {l: i for i, l in enumerate(LABEL_LIST)}
ID2LABEL   = {i: l for i, l in enumerate(LABEL_LIST)}

RAW_CORPUS = [
    # --- Forms / structured data ---
    {
        "tokens":   ["Full", "name", ":", "Alice", "Johnson"],
        "ner_tags": ["O",    "O",    "O", "B-PER", "I-PER"]
    },
    {
        "tokens":   ["Cardholder", ":", "Robert", "Smith"],
        "ner_tags": ["O",          "O", "B-PER",  "I-PER"]
    },
    {
        "tokens":   ["Patient", "name", ":", "Maria", "Garcia"],
        "ner_tags": ["O",       "O",    "O", "B-PER", "I-PER"]
    },
    {
        "tokens":   ["Shipped", "to", "John", "Doe", "in", "New", "York"],
        "ner_tags": ["O",       "O",  "B-PER","I-PER","O","B-LOC","I-LOC"]
    },
    {
        "tokens":   ["Account", "holder", ":", "Emily", "Chen"],
        "ner_tags": ["O",       "O",      "O", "B-PER", "I-PER"]
    },
    {
        "tokens":   ["Dr", ".", "James", "Williams", "confirmed"],
        "ner_tags": ["O",  "O", "B-PER", "I-PER",   "O"]
    },
    # --- Addresses ---
    {
        "tokens":   ["123", "Main", "Street", ",", "Austin", ",", "TX"],
        "ner_tags": ["O",   "O",    "O",      "O", "B-LOC",  "O", "O"]
    },
    {
        "tokens":   ["deliver", "to", "Seattle", "WA", "98101"],
        "ner_tags": ["O",       "O",  "B-LOC",   "O",  "O"]
    },
    # --- Safe examples (must NOT be flagged) ---
    {
        "tokens":   ["Please", "submit", "your", "order", "by", "Friday"],
        "ner_tags": ["O",      "O",      "O",    "O",     "O",  "O"]
    },
    {
        "tokens":   ["Shipping", "takes", "3", "to", "5", "business", "days"],
        "ner_tags": ["O",        "O",     "O", "O", "O", "O",         "O"]
    },
    {
        "tokens":   ["Enter", "your", "email", "address", "below"],
        "ner_tags": ["O",     "O",    "O",     "O",       "O"]
    },
]

def build_dataset(raw, tokenizer):
    """Tokenize and align NER labels with word-piece offsets."""
    rows = {"input_ids": [], "attention_mask": [], "labels": []}
    for example in raw:
        enc = tokenizer(
            example["tokens"],
            is_split_into_words=True,
            truncation=True,
            max_length=128,
        )
        word_ids = enc.word_ids()
        label_ids, prev_word = [], None
        for wid in word_ids:
            if wid is None:
                label_ids.append(-100)
            elif wid != prev_word:
                label_ids.append(LABEL2ID[example["ner_tags"][wid]])
            else:
                # Continuation token: use I- variant if B- was assigned
                raw_lbl = example["ner_tags"][wid]
                i_lbl   = raw_lbl.replace("B-", "I-") if raw_lbl.startswith("B-") else raw_lbl
                label_ids.append(LABEL2ID[i_lbl])
            prev_word = wid
        rows["input_ids"].append(enc["input_ids"])
        rows["attention_mask"].append(enc["attention_mask"])
        rows["labels"].append(label_ids)
    return Dataset.from_dict(rows)


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    true_labels, true_preds = [], []
    for pred_row, label_row in zip(preds, labels):
        tl, tp = [], []
        for p, l in zip(pred_row, label_row):
            if l != -100:
                tl.append(ID2LABEL[l])
                tp.append(ID2LABEL[p])
        true_labels.append(tl)
        true_preds.append(tp)
    return {"f1": f1_score(true_labels, true_preds)}


# ---------------------------------------------------------------------------
# 2. HuggingFace authentication
#    Option A (recommended): set env var before running:
#      $env:HF_TOKEN = "hf_your_token_here"  (PowerShell)
#      export HF_TOKEN=hf_your_token_here      (bash)
#    Option B: run `huggingface-cli login` once, token is cached.
#    Get a free token at: https://huggingface.co/settings/tokens
# ---------------------------------------------------------------------------
import os
from huggingface_hub import login as hf_login

hf_token = os.environ.get('HF_TOKEN')
if hf_token:
    hf_login(token=hf_token, add_to_git_credential=False)
    print('Logged in via HF_TOKEN env var')
else:
    print('No HF_TOKEN env var found.')
    print('Run: $env:HF_TOKEN = "hf_xxx"  or  huggingface-cli login')
    raise SystemExit(1)

# ---------------------------------------------------------------------------
# 3. Load base model
# ---------------------------------------------------------------------------
MODEL_NAME   = 'dslim/distilbert-base-NER'
OUTPUT_DIR   = 'models/pii-ner-finetuned'
ONNX_DIR     = 'models/pii-ner-onnx'

print(f'Loading tokenizer and model from {MODEL_NAME}...')
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, token=hf_token)
model     = AutoModelForTokenClassification.from_pretrained(
    MODEL_NAME,
    id2label=ID2LABEL,
    label2id=LABEL2ID,
    ignore_mismatched_sizes=True,   # label count may differ from base checkpoint
)

# ---------------------------------------------------------------------------
# 3. Build train / eval split (80/20)
# ---------------------------------------------------------------------------
split     = int(len(RAW_CORPUS) * 0.8)
train_ds  = build_dataset(RAW_CORPUS[:split], tokenizer)
eval_ds   = build_dataset(RAW_CORPUS[split:], tokenizer)
dataset   = DatasetDict({"train": train_ds, "validation": eval_ds})

collator  = DataCollatorForTokenClassification(tokenizer)

# ---------------------------------------------------------------------------
# 4. Training arguments — conservative to avoid catastrophic forgetting
# ---------------------------------------------------------------------------
args = TrainingArguments(
    output_dir               = OUTPUT_DIR,
    num_train_epochs         = 10,
    per_device_train_batch_size = 8,
    per_device_eval_batch_size  = 8,
    learning_rate            = 2e-5,      # low LR to preserve CoNLL knowledge
    weight_decay             = 0.01,
    warmup_steps             = 20,
    evaluation_strategy      = "epoch",
    save_strategy            = "epoch",
    load_best_model_at_end   = True,
    metric_for_best_model    = "f1",
    report_to                = "none",
    logging_steps            = 5,
)

trainer = Trainer(
    model           = model,
    args            = args,
    train_dataset   = dataset["train"],
    eval_dataset    = dataset["validation"],
    tokenizer       = tokenizer,
    data_collator   = collator,
    compute_metrics = compute_metrics,
)

print("Starting fine-tuning…")
trainer.train()
trainer.save_model(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print(f"Fine-tuned model saved to {OUTPUT_DIR}/")

# ---------------------------------------------------------------------------
# 5. Export to ONNX for Transformers.js
# ---------------------------------------------------------------------------
print("Exporting to ONNX…")
os.makedirs(ONNX_DIR, exist_ok=True)
from optimum.onnxruntime import ORTModelForTokenClassification
ort_model = ORTModelForTokenClassification.from_pretrained(OUTPUT_DIR, export=True)
ort_model.save_pretrained(ONNX_DIR)
tokenizer.save_pretrained(ONNX_DIR)
print(f"ONNX model saved to {ONNX_DIR}/")
print("Load in extension background.js with:")
print("  pipeline('token-classification', chrome.runtime.getURL('models/pii-ner-onnx'), { quantized: false })")
