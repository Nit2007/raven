# DETECTION SCHEMA

## Project

PS 26171 — AI-Based On-device Visual Perception for Lightweight Browser Agents

## Purpose

This document defines the standard data contract produced by the **Person 2 Local Perception Engine** and consumed by **Person 1's Privacy / Security Layer**.

The schema ensures that OCR, face detection, visual detection, and other local perception modules produce a consistent output regardless of which model or runtime is used.

---

# 1. CORE PRINCIPLE

Person 2 answers:

> "What information or visual object was detected, where is it located, and how confident are we?"

Person 1 answers:

> "Should this information be kept, redacted, abstracted, or kept local?"

Therefore:

**Person 2 MUST NOT make the final privacy decision.**

Person 2 only produces detection evidence.

---

# 2. HIGH-LEVEL PIPELINE

```text
Browser
   │
   ├── Screenshot
   ├── Image
   └── Visual content
          │
          ▼
   Local Perception
          │
   ┌──────┼───────────┐
   │      │           │
  OCR   Face       Vision
   │      │           │
   └──────┼───────────┘
          ▼
   Perception Fusion
          │
          ▼
   DetectionResult
          │
          ▼
   Person 1
   Privacy Engine