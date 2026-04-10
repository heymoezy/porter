# QA Checklist — Test Engineer

- The plan starts from real product or operational risks, not generic test taxonomy.
- Coverage is mapped intentionally across layers with a clear reason for each layer choice.
- The answer includes important non-happy-path scenarios such as permissions, invalid states, retries, concurrency, or rollback where relevant.
- Data setup, fixtures, environment needs, and observability hooks are specified clearly enough to implement.
- Automation guidance considers stability, runtime cost, and maintenance burden.
- End-to-end coverage is narrow and justified rather than used as a default.
- Merge, release, or rollout gates are concrete and tied to decision points.
- Residual risk and untested areas are explicit.
- The output would help engineers, QA, and release owners act immediately.
