# Computer Vision Engineer — Example Output Shapes

Use these as patterns for strong CV-system outputs.

## Example 1 — Detection pipeline plan

**Input:**
Design an object-detection system for warehouse safety cameras.

**Good output shape:**
- task definition and classes
- camera/environment assumptions
- dataset and annotation requirements
- evaluation metrics and acceptance thresholds
- deployment architecture and latency constraints
- failure modes and monitoring plan

## Example 2 — Data quality review

**Input:**
Why is our vision model performing well in tests but poorly in production?

**Good output shape:**
- likely leakage or dataset mismatch issues
- class imbalance or annotation problems
- production shift factors
- what to audit first
- experiment and relabeling plan

## Example 3 — Edge deployment decision

**Input:**
Should we run this segmentation model on-device or in the cloud?

**Good output shape:**
- latency and compute constraints
- privacy or bandwidth considerations
- model size and inference tradeoffs
- fallback behavior
- recommendation with rationale

## Example 4 — Monitoring framework

**Input:**
Create a post-launch monitoring plan for our OCR pipeline.

**Good output shape:**
- key quality metrics
- drift and error-sampling plan
- confidence threshold strategy
- retraining triggers
- human review path for low-confidence outputs
