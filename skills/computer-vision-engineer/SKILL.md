---
name: computer-vision-engineer
description: Design, build, evaluate, and operationalize image and video analysis systems for detection, classification, segmentation, tracking, OCR, and visual understanding tasks. Use when the task involves computer vision pipelines, dataset curation, annotation strategy, model evaluation, deployment constraints, or real-world robustness issues. Do not use for generic ML tasks when visual data is not central.
---

# Computer Vision Engineer

Make visual systems work in the real world, not just on a clean benchmark.

This skill is for end-to-end computer vision problem solving: framing the task, designing the data pipeline, choosing the right modeling approach, evaluating performance honestly, and planning for deployment under real lighting, occlusion, drift, and latency constraints.

## Scope

Use this skill for:
- image or video pipeline design
- object detection, classification, segmentation, tracking, OCR, pose, and related vision tasks
- dataset strategy, curation, and annotation planning
- training/evaluation design for CV systems
- deployment planning for cloud, mobile, edge, or real-time inference
- robustness analysis under lighting, occlusion, camera variance, and domain shift
- post-deployment monitoring and retraining strategy

## Use this skill when

Use this skill when the task needs:
- a vision-specific ML approach
- image/video data pipeline planning
- model-evaluation guidance with task-appropriate metrics
- diagnosis of why a CV system works in demos but fails in production
- deployment or monitoring choices for a visual model
- a realistic treatment of annotation quality, bias, and domain shift

## Do not use this skill when

Do not use this skill for:
- general predictive modeling with no visual data component
- vague “AI image feature” ideas with no task definition
- pure frontend/media rendering work with no vision model involved
- claims of causal inference from purely predictive CV outputs

## Inputs to gather

Before recommending solutions, identify:
- vision task type
- target environment: cloud, mobile, edge, embedded, real-time, batch
- input sources: camera, uploaded images, scans, video stream, satellite, medical imagery, etc.
- dataset size, class balance, annotation quality, and known edge cases
- latency, accuracy, throughput, and hardware constraints
- failure conditions: blur, occlusion, low light, motion, rare classes, camera drift
- evaluation metric that actually matters for the task
- downstream action if the model is wrong

If the task is underspecified, define the target prediction and acceptance threshold first.

## Output expectations

Return outputs such as:
- CV system design
- dataset and annotation plan
- model and evaluation strategy
- deployment or inference architecture
- robustness/risk analysis
- monitoring and retraining plan
- experiment roadmap

Use tables when comparing approaches. Tie the design to operational constraints.

## Working method

### 1. Start with the task definition

Clarify exactly what the system must do:
- classify an image?
- detect objects?
- segment regions?
- track over time?
- extract text?
- trigger an operational decision?

Vision problems often fail because the objective was underspecified.

### 2. Treat data as the core system

Review:
- source diversity
- labeling quality
- class balance
- train/validation/test split discipline
- leakage risk between scenes, cameras, patients, locations, or time windows
- representation of hard real-world conditions

A strong model on weak data still fails in production.

### 3. Match evaluation to the actual task

Use metrics that reflect reality, for example:
- precision/recall/F1 for classification or detection contexts
- IoU and mAP for detection/segmentation where relevant
- calibration/confidence quality when thresholds matter
- latency and throughput when real-time use matters
- sliced evaluation across lighting, camera types, locations, or rare classes

Do not rely on one headline metric alone.

### 4. Plan for real-world failure modes

Analyze conditions such as:
- blur or motion
- occlusion
- low-light or harsh-light conditions
- camera angle differences
- distribution shift across locations or devices
- annotation inconsistency
- adversarial or weird edge cases

Production CV quality is usually a robustness problem, not just a model architecture problem.

### 5. Design deployment with inference constraints in mind

Assess:
- latency budget
- memory and compute limits
- batch vs streaming inference
- edge vs cloud tradeoffs
- fallback or human-review path when confidence is low
- observability after deployment

A model that is accurate but too slow or too brittle is still a bad solution.

### 6. Make monitoring part of the design

A usable CV plan should include:
- drift monitoring
- low-confidence capture paths
- error sampling and relabeling loop
- periodic re-evaluation on fresh data
- slice-based performance monitoring
- triggers for retraining or rollback

## Adjacent skill boundaries

- **data-scientist**: broader modeling role; this skill is specifically visual-data and deployment-problem focused
- **ml-engineer**: broader ML infrastructure and serving concerns; this skill focuses on CV task framing, data, and evaluation specifics
- **computer-vision-researcher** if one existed would focus on novel model research; this skill is production-oriented engineering
- **clinical-researcher / healthcare-analyst** may own domain interpretation in medical contexts; this skill handles the CV system design itself

## Quality bar

A strong result should:
- define the vision task precisely
- center data quality and split discipline
- evaluate using task-appropriate metrics and slices
- account for real production failure modes
- match deployment design to hardware and latency constraints
- include monitoring and retraining logic

## References to use

Use `prompt.md` for analysis posture and response structure.
Use `guides/qa-checklist.md` before finalizing.
Use `examples/README.md` for output patterns.
Use `meta/skill.json` for boundaries and metadata.
