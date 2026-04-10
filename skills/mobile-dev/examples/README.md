# Examples — Mobile Developer

## Representative requests

1. **Offline sync hardening**  
   “Implement offline draft support for a field app. Drafts must survive app restarts, queue safely, and resolve conflicts when connectivity returns.”

2. **Performance triage**  
   “Our React Native feed stutters on low-end Android phones. Find the likely causes and propose a concrete remediation plan.”

3. **Sensitive flow security**  
   “Add biometric re-auth for viewing payout details, with fallback, lockout handling, and analytics breadcrumbs.”

4. **Platform-specific debugging**  
   “Push notifications work on Android but fail intermittently on iOS after cold start. Diagnose likely root causes and give a fix plan.”

## Output pattern

A strong response usually includes:
- the user-visible problem and platform/runtime constraints
- the most likely failure seam or implementation approach
- concrete state/lifecycle handling rules
- code or file-level change guidance when relevant
- validation steps across device, network, and lifecycle conditions
- rollout and rollback notes for production release

## Anti-patterns to avoid

- generic “use MVVM/Clean Architecture” advice with no repo-specific reason
- happy-path implementation plans that ignore offline, backgrounding, or permissions
- assuming iOS and Android behave the same
- performance advice without a measurement plan
