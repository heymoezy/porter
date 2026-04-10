# Examples — Model Trainer

## Representative requests

1. **Classical ML pipeline**  
   “Build a training plan for churn prediction with time-based splits, feature freshness controls, and weekly retraining.”

2. **LLM fine-tuning**  
   “Fine-tune a small support model on domain transcripts while preserving refusals and reducing hallucinations.”

3. **Stability remediation**  
   “Our multimodal model diverges after the third epoch. Diagnose the likely causes and propose a disciplined debug plan.”

4. **Compute-constrained optimization**  
   “We need better retrieval ranking but only have two GPUs and a strict latency budget. Propose a realistic training roadmap.”

## Output pattern

A strong response usually includes:
- task objective, incumbent baseline, and success threshold
- data contract and split assumptions
- recommended model/training recipe with rationale
- experiment matrix, tracking rules, and stop conditions
- serving and packaging implications
- promotion, rollback, and retraining guidance

## Anti-patterns to avoid

- recommending complex architectures before establishing a baseline
- ignoring dataset provenance, leakage, or label ambiguity
- proposing expensive sweeps with no hypothesis or stop rule
- handing off a “best checkpoint” with no reproducible trail
