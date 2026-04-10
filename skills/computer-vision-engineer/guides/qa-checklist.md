# QA Checklist — Computer Vision Engineer

Use this before finalizing any computer-vision output.

## 1. Task and data clarity
- Is the exact vision task clearly defined?
- Are data sources, labels, and edge-case conditions described realistically?
- Are train/validation/test separation and leakage risks addressed?

## 2. Evaluation quality
- Are metrics appropriate for the task and operational decision?
- Is slice-based or scenario-based evaluation considered where needed?
- Are benchmark claims kept separate from production expectations?

## 3. Robustness and deployment
- Are lighting, occlusion, camera shift, or domain shift issues addressed?
- Are hardware, latency, and inference constraints included?
- Is fallback behavior considered for low-confidence or failed predictions?

## 4. Monitoring and iteration
- Is there a plan for drift detection, error sampling, and retraining?
- Are annotation or relabeling feedback loops considered?
- Would the team know how to detect degradation after deployment?

## 5. Output quality
- Is the recommendation practical, precise, and production-aware?
- Does it avoid hand-wavy CV optimism?
- Would a CV team trust it enough to plan work from it?
